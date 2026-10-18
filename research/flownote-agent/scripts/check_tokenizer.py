"""Measure, don't assume: what Gemma 4's tokenizer actually costs.

    python scripts/check_tokenizer.py

Answers the three questions the plan depends on:

  1. Are all twelve agentic control tokens single tokens? (They are - which is
     why this project adds nothing to the tokenizer and never resizes the 262k
     embedding matrix.)
  2. What is the real Korean compression ratio? The original plan assumed
     0.6-0.9 tokens per syllable; this prints the truth.
  3. How much cheaper is Gemma 4's native call encoding than JSON?
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from flownote_agent.protocol import CONTROL_TOKENS, ToolCall, format_tool_call  # noqa: E402

KO_SAMPLES = [
    "어제 standup 노트에 action item 하나 추가해줘.",
    "포항의 현재 날씨를 확인하고 30분 뒤에 알림을 설정해줘.",
    "지난주에 작성한 회의록 중에서 배포 파이프라인 관련 내용을 찾아 요약해줘.",
    "김치찌개 레시피 노트를 만들고 태그를 요리로 지정해줘.",
    "이 노트를 PDF로 내보내고 다운로드 링크를 알려줘.",
]
EN_SAMPLES = [
    "Add an action item to yesterday's standup note.",
    "Check the weather in Pohang and set a reminder in 30 minutes.",
    "Find last week's meeting notes about the deploy pipeline and summarise them.",
    "Create a kimchi stew recipe note and tag it as cooking.",
    "Export this note to PDF and give me the download link.",
]

CALL = ToolCall("set_reminder", {
    "message": "스탠드업 준비",
    "remind_at": "2026-07-30T10:10:00+09:00",
})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="google/gemma-4-E2B-it")
    args = ap.parse_args()

    tok = AutoTokenizer.from_pretrained(args.model)
    enc = lambda s: tok(s, add_special_tokens=False)["input_ids"]  # noqa: E731

    print(f"model            {args.model}")
    print(f"tokenizer        {type(tok).__name__}")
    print(f"vocab size       {len(tok):,}")
    print(f"bos / eos / pad  {tok.bos_token!r} / {tok.eos_token!r} / {tok.pad_token!r}")

    print("\n--- agentic control tokens ---")
    bad = []
    for token in CONTROL_TOKENS:
        ids = enc(token)
        ok = len(ids) == 1
        if not ok:
            bad.append(token)
        print(f"  {token:<20} id={ids[0] if ok else ids}  {'single' if ok else 'MULTI-TOKEN'}")
    if bad:
        print(f"\n  !! {len(bad)} control tokens are not single tokens: {bad}")
        print("     This is not a Gemma 4 tokenizer. Check --model.")
    else:
        print("\n  All single tokens. The entire agent protocol - thinking channel,")
        print("  tool declarations, calls, responses, string delimiter - is native")
        print("  vocabulary. Nothing is added to the tokenizer, so the 262k x 1536")
        print("  embedding matrix is never resized and stays trainable-free.")

    print("\n--- Korean vs English efficiency ---")
    ko_ratios, en_ratios = [], []
    for s in KO_SAMPLES:
        syllables = sum(1 for ch in s if "가" <= ch <= "힣")
        n = len(enc(s))
        if syllables:
            ko_ratios.append(n / syllables)
        print(f"  ko {n:>3} tok / {syllables:>3} syllables = "
              f"{n / max(1, syllables):.2f} tok/syllable   {s[:32]}")
    for s in EN_SAMPLES:
        words = len(s.split())
        n = len(enc(s))
        en_ratios.append(n / words)
        print(f"  en {n:>3} tok / {words:>3} words     = "
              f"{n / words:.2f} tok/word        {s[:32]}")

    print(f"\n  Korean : {statistics.mean(ko_ratios):.2f} tokens per syllable "
          f"(plan doc assumed 0.6-0.9)")
    print(f"  English: {statistics.mean(en_ratios):.2f} tokens per word "
          f"(plan doc assumed 1.1-1.3)")

    print("\n--- a tool call: native encoding vs JSON ---")
    native = format_tool_call(CALL)
    as_json = json.dumps({"name": CALL.name, "arguments": CALL.arguments},
                         ensure_ascii=False)
    escaped = json.dumps({"name": CALL.name, "arguments": CALL.arguments})
    print(f"  native   {len(enc(native)):>3} tok   {native[:76]}")
    print(f"  JSON     {len(enc(as_json)):>3} tok   {as_json[:76]}")
    print(f"  JSON+\\u  {len(enc(escaped)):>3} tok   (ascii-escaped Korean)")
    print("\n  The native form wins because <|tool_call>, <|\"|> and the delimiters")
    print("  are one token each, where JSON spends real tokens on braces and quotes.")

    print("\n--- turn overhead ---")
    for label, text in (("empty user turn", "<|turn>user\n<turn|>\n"),
                        ("empty model turn", "<|turn>model\n<turn|>\n"),
                        ("thought wrapper", "<|channel>thought\n\n<channel|>")):
        print(f"  {label:<18} {len(enc(text)):>2} tok")


if __name__ == "__main__":
    main()
