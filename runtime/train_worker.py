import argparse
import io
import json
import math
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def read_request() -> dict:
    line = sys.stdin.readline()
    if not line:
        raise ValueError("The training worker did not receive a request.")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("The training request must be a JSON object.")
    return value


def bounded_int(value: object, name: str, minimum: int, maximum: int) -> int:
    parsed = int(value)
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    request = read_request()

    model_path = Path(arguments.model).expanduser().resolve()
    dataset_path = Path(arguments.dataset).expanduser().resolve()
    output_dir = Path(arguments.output).expanduser().resolve()
    if not (model_path / "config.json").is_file():
        raise ValueError(
            "The base model must be a local Transformers directory containing config.json."
        )
    if not dataset_path.is_file():
        raise ValueError(f"Training dataset not found: {dataset_path}")
    if dataset_path.suffix.lower() not in {".json", ".jsonl", ".csv"}:
        raise ValueError("Training data must be JSON, JSONL, or CSV.")

    epochs = bounded_int(request.get("epochs", 3), "epochs", 1, 100)
    batch_size = bounded_int(request.get("batch_size", 1), "batch size", 1, 64)
    gradient_accumulation = bounded_int(
        request.get("gradient_accumulation", 8),
        "gradient accumulation",
        1,
        256,
    )
    lora_rank = bounded_int(request.get("lora_rank", 16), "LoRA rank", 1, 256)
    max_sequence_length = bounded_int(
        request.get("max_sequence_length", 2048),
        "max sequence length",
        128,
        32768,
    )
    learning_rate = float(request.get("learning_rate", 0.0002))
    if not 0 < learning_rate <= 0.1:
        raise ValueError("Learning rate must be greater than 0 and at most 0.1.")
    use_4bit = bool(request.get("use_4bit", True))
    gradient_checkpointing = bool(request.get("gradient_checkpointing", True))

    emit({"type": "status", "message": "Importing training runtime..."})
    try:
        import torch
        from datasets import load_dataset
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            Trainer,
            TrainerCallback,
            TrainingArguments,
        )
    except ImportError as error:
        raise RuntimeError(
            "Training runtime dependencies are missing. Install "
            "runtime/requirements-training.txt into the selected Python environment."
        ) from error

    if use_4bit and not torch.cuda.is_available():
        raise RuntimeError("4-bit QLoRA requires a CUDA-capable NVIDIA GPU.")

    emit({"type": "status", "message": f"Loading tokenizer from {model_path.name}..."})
    tokenizer = AutoTokenizer.from_pretrained(
        str(model_path), trust_remote_code=False, local_files_only=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    emit({"type": "status", "message": "Loading base model..."})
    load_options = {
        "device_map": "auto",
        "trust_remote_code": False,
        "local_files_only": True,
    }
    if use_4bit:
        compute_dtype = (
            torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        )
        load_options["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_use_double_quant=True,
        )
    else:
        load_options["torch_dtype"] = (
            torch.float16 if torch.cuda.is_available() else torch.float32
        )
    model = AutoModelForCausalLM.from_pretrained(str(model_path), **load_options)
    if use_4bit:
        model = prepare_model_for_kbit_training(
            model, use_gradient_checkpointing=gradient_checkpointing
        )
    if gradient_checkpointing:
        model.config.use_cache = False

    emit({"type": "status", "message": "Attaching LoRA adapters..."})
    model = get_peft_model(
        model,
        LoraConfig(
            r=lora_rank,
            lora_alpha=lora_rank * 2,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        ),
    )

    emit({"type": "status", "message": f"Loading {dataset_path.name}..."})
    dataset_type = "csv" if dataset_path.suffix.lower() == ".csv" else "json"
    dataset = load_dataset(
        dataset_type, data_files=str(dataset_path), split="train"
    )

    def tokenize(example: dict) -> dict:
        if "messages" in example:
            text = tokenizer.apply_chat_template(
                example["messages"], tokenize=False, add_generation_prompt=False
            )
        elif "text" in example:
            text = str(example["text"])
        else:
            text = " ".join(
                str(value) for value in example.values() if isinstance(value, str)
            )
        tokens = tokenizer(
            text,
            truncation=True,
            max_length=max_sequence_length,
            padding="max_length",
        )
        tokens["labels"] = [
            token if token != tokenizer.pad_token_id else -100
            for token in tokens["input_ids"]
        ]
        return tokens

    dataset = dataset.map(tokenize, remove_columns=dataset.column_names)
    steps_per_epoch = max(
        1, math.ceil(len(dataset) / (batch_size * gradient_accumulation))
    )
    total_steps = steps_per_epoch * epochs
    emit(
        {
            "type": "config",
            "total_steps": total_steps,
            "samples": len(dataset),
        }
    )

    class StreamCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            if not logs:
                return
            payload = {
                "type": "progress",
                "step": state.global_step,
                "total": state.max_steps or total_steps,
            }
            if "loss" in logs:
                payload["loss"] = logs["loss"]
            emit(payload)

    output_dir.mkdir(parents=True, exist_ok=True)
    training_arguments = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation,
        learning_rate=learning_rate,
        fp16=torch.cuda.is_available() and not use_4bit,
        bf16=False,
        logging_steps=1,
        save_strategy="epoch",
        optim="paged_adamw_8bit" if use_4bit else "adamw_torch",
        report_to=[],
        disable_tqdm=True,
        gradient_checkpointing=gradient_checkpointing,
    )
    emit({"type": "status", "message": "Training adapter..."})
    trainer = Trainer(
        model=model,
        args=training_arguments,
        train_dataset=dataset,
        callbacks=[StreamCallback()],
    )
    trainer.train()
    emit({"type": "status", "message": "Saving adapter..."})
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    emit({"type": "done", "path": str(output_dir)})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        sys.exit(1)