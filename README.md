# SLLM
A simple, light-weight command line interface for the GPT3 LLM.

> $ sllm what bash command can be used to check the status of a running systemd service?
> 
> The command to check the status of a running systemd service is "systemctl status <service_name>".
> 
> 
> $ sllm how can I get the full log instead?
> 
> To get the full log of a running systemd service, you can use the command "journalctl -u <service_name>".


## Install

```
npm install -g sllm
```

## Setup

Get an OpenAI [API KEY](https://platform.openai.com/account/api-keys).

```
export OPENAI_API_KEY=<your_api_key>
```

## Quick Start

```
$ sllm how many people live in china? 

According to the latest estimates, there are approximately 1.4 billion people living in China.
```

## Chat Mode
To enable a "chat mode" similar to chatGPT, run the following command:

```
sllm set -H 4
```

This will remind the LLM about the last 4 prompts it was given. 

## Overview
```
$ sllm -h

Usage: sllm [options] [command]

CLI for GPT3. Created by Mathieu Dombrock 2023. GPL3 License.

Options:
  -V, --version                 output the version number
  -h, --help                    display help for command

Commands:
  prompt [options] <prompt...>  Send a prompt (default command)
  set [options]                 Set a persistant command option
  settings                      View the current settings that were changed via the `set` command.
  hist [options]                Manage the prompt/response history
  help [command]                display help for command
```

## Prompt

```
$ sllm -h prompt

Usage: sllm prompt [options] <prompt...>

Send a prompt (default command)

Arguments:
  prompt                      the prompt text

Options:
  -m, --max-tokens <number>   maximum tokens to use (default: "256")
  -t, --temperature <number>  temperature to use (default: "0.2")
  -c, --context <string...>   Context to prepend
  -d, --domain <string...>    Subject domain to prepend
  -e, --expert <string...>    Act as an expert on this domain
  -H, --history <number>      Prepend history (chatGPT mode) (default: "0")
  -v, --verbose               verbose output
  -M, --mock                  Dont actually send the prompt to the API
  -h, --help                  display help for command
```
