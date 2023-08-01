# Coroner's report analyser
An experiment in using OpenAI's GPT-3.5 to determine whether a death was the result of a delayed ambulance

## Usage
First, get the PFD_docs from [Google Drive](https://drive.google.com/drive/folders/1R4cfQQ53UnWkDF3mMXlBI7XdnPgzDk49) and put them into `data/PFD_docs/`.

Then,
```
deno run --check -A delayed-ambulance.ts 2>err 1>out.json
cat out.json | jq 'select(.yesNo == "YES").year' | sort | uniq -c
```