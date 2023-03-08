# SLLM - Command Line ChatGPT-like Assistant
A command line interface for the GPT3 LLM that emulates some features of ChatGPT (Bring your own token).

In addition to providing a simple interface for talking with GPT3, this tool also offers a few extra features built on top of the GPT3 API. 

### Extra Features:
- Act as a chat bot (emulates chatGPT)
- Read local files
- Automatically prepend subject domains & context (Bash, JS, Physics etc.)
- Expert Mode (act as an expert on some subject)
- Explain it like I'm 5 (explain the answer simply)

### Why Not Use ChatGPT?
You can do whatever you want :)

I made this for the following reasons:

- Access GPT3 without leaving the command line
- Access GPT3 without logging in to OpenAI (use a token instead)
- Directly read and write local files
- I don't always have easy access to a GUI

> $ sllm what would be the avantage of talking to a LLM via the command line?
> 
> The advantage of talking to a LLM via the command line is that it allows for a more efficient and direct way of communicating. It also allows for more precise and specific commands to be used, which can help to quickly get the desired results.

---

### Example Usage:

> $ sllm what can be used to check the status of a running systemd service? -e bash scripting
> 
> The command to check the status of a running systemd service is "systemctl status <service_name>".
> 
> 
> $ sllm how can I get the full log instead? -d bash -H 1
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
sllm set -H 3
```

This will remind the LLM about the last 3 prompts it was given. 

## Overview
```
$ sllm -h

Usage: sllm [options] [command]

CLI for GPT3. Created by Mathieu Dombrock 2023. GPL3 License.

Options:
  -V, --version                 output the version number
  -h, --help                    display help for command

Commands:
  prompt [options] <prompt...>  send a prompt (default command)
  set [options]                 set a persistant command option
  settings [options]            view the current settings that were changed via the `set` command
  hist [options]                manage the prompt / response history
  purge                         delete all history and settings
  count [options]               estimate the tokens used by a prompt or file
  repeat                        repeat the last response
  help [command]                display help for command

```

## Prompt

```
$ sllm -h prompt

Usage: sllm prompt [options] <prompt...>

send a prompt (default command)

Arguments:
  prompt                      the prompt text

Options:
  -v, --verbose               verbose output
  -m, --max-tokens <number>   maximum tokens to use (default: "256")
  -t, --temperature <number>  temperature to use (default: "0.2")
  -c, --context <string...>   context to prepend
  -d, --domain <string...>    subject domain to prepend
  -e, --expert <string...>    act as an expert on this domain
  -5, --like-im-five          explain it like I'm 5 years old
  -H, --history <number>      prepend history (chatGPT mode)
  -f, --file <path>           preprend the given file contents
  -T, --trim                  automatically trim the given file contents
  -M, --mock                  dont actually send the prompt to the API
  -h, --help                  display help for command

```

## Working With Files

You can prepend a reference to a file with the `-f` or `--file` option.

However, be aware that files can not exceed 4k tokens. To the best of my knowlege, there is no way to get the GPT3 API to process more than 4096 tokens at once which means that this is a hard limitation and it would not be possible to get a meaningful analysis of a file that exceeds 4k tokens. 

**NOTE: At the time of writing, sending a file that contains 4k tokens would cost about $0.08 (USD). See [OpenAI Pricing](https://openai.com/pricing) for more info.**

### Trimming Files to Save Tokens
If your files are too large or you simply want to save a few tokens, you can try adding the `--trim` flag when loading a file. This command will attempt to remove all white spaces, tabs and new lines from the file. This might confuse the LLM so it's typically better to avoid this option unless needed. 

Depending on the type of file you want to analyse, you might also try minifying the file before running it through sllm. 

### Usage Examples:
```
$ sllm write a summary of this file -f sllm.js

  This file is a Node.js script that provides a command line interface (CLI) for interacting with OpenAI's GPT-3 API.

$ sllm what dependancies does this have -f ./package.json

 This package.json file has two dependencies: gpt-3-encoder and openai.

$ sllm what version of npm is this file built for? -f ./package.json

  This package.json file is built for npm version 6.14.4 or higher.

$ cat example.js

  const e = require('./llm.js');
  console.log(e);

$ sllm is this file NodeJS or Browser JS? -f example.js

  This file is Node.js.

$ sllm why do you say that?

  This file contains code that is specific to Node.js, such as the require statement, which is not supported in browser JavaScript.

$ sllm what is this file about? -f mute.cpp
  This file is about demonstrating the differences between mutating a value by reference, by pointer, and not mutating it at all. It contains three functions, noMute, muteR, and muteP, which respectively do not mutate the value, mutate the value by reference, and mutate the value by pointer. There is also a print function to output the results of the functions.

$ sllm what is this file about? -f cfg.txt
  This file is about creating a GIF animation of Conway's Game of Life using the .sorg settings. The animation will have a file name of "life", a frame delay of 1, 512 frames to render, 0 generations to run before render, a canvas width of 64, a canvas height of 64, a pixel/image scale of 8, a gif color pallet of lime, and a rule set of dtsd. Additionally, the .sorg settings include a file to load of "noise", a center of 0, an x offset of 1, and a y offset of 1.
```

## Counting Tokens

If you want to estimate how many tokens a prompt or file will consume, you can use the `sllm count` command.

```
$ sllm help count

Usage: sllm count [options]

estimate the tokens used by a prompt or file

Options:
  -p, --prompt <string...>  the prompt string to check
  -f, --file <path>         the file path to check
  -h, --help                display help for command
```


