# Coroner's Report Classifier
Uses OpenAI's GPT-3.5 to classify Coroner's Reports according to whether they mention a problem with the ambulance service.

This task was done manually and laboriously for [this story](https://www.theguardian.com/society/2023/mar/09/more-than-500-deaths-in-england-last-year-after-long-ambulance-wait).

This is a retrospective experimental application of an LLM to the problem, to see how well it lines up with the journalists' judgements.

## Usage
First, get the PFD_docs from [Google Drive](https://drive.google.com/drive/folders/1R4cfQQ53UnWkDF3mMXlBI7XdnPgzDk49) and put them into `data/PFD_docs/`.

Then run them through OCR and extract the text to .txt files:

```
./pdfs-to-text.py
```

Then, run them through `GPT-3.5-turbo`:
```
deno run --check -A delayed-ambulance.ts 2>err 1>out.json
```

To see the YES count by year:
```
cat out.json | jq 'select(.yesNo == "YES").year' | sort | uniq -c
```

To create a CSV of all results:
```
cat out.json | jq -r '[.originalNameRoot, .yesNo] | @csv'
```
