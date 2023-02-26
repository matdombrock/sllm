#!/usr/bin/env bash

if [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: OPENAI_API_KEY unset"
    echo "To set, use the command:"
    echo "export OPENAI_API_KEY=<your_key>"
    echo "https://platform.openai.com/account/api-keys"
    exit 1
fi

MAX_TOKENS="${SLLM_MAX_TOKENS:-256}"
TEMPERATURE="${SLLM_TEMPERATURE:-0.4}"

run() {
    prompt="$*"
    response=$(curl -s -X POST https://api.openai.com/v1/engines/text-davinci-003/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -d "{
        \"prompt\": \"$prompt\",
        \"max_tokens\": $MAX_TOKENS,
        \"temperature\": $TEMPERATURE
    }")
    echo "-------"
    echo $(echo "$response" | jq -r '.choices[0].text')
}

if [ -z "$*" ]; then
    echo "ERROR: Please provide a prompt"
    exit 1
fi

run "$@"

