import { ChatCompletionRequestMessage, Configuration, CreateChatCompletionRequest, OpenAIApi } from "npm:openai";

// This is a deno script!

function dedent(
  strings: string | TemplateStringsArray,
  ...values: string[]
) {
  const raw = typeof strings === "string" ? [strings] : strings.raw;

  // first, perform interpolation
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    result += raw[i]
      // join lines when there is a suppressed newline
      .replace(/\\\n[ \t]*/g, "")
      // handle escaped backticks
      .replace(/\\`/g, "`");

    if (i < values.length) {
      result += values[i];
    }
  }

  // now strip indentation
  const lines = result.split("\n");
  let mindent: number | null = null;
  for (const l of lines) {
    const m = l.match(/^(\s+)\S+/);
    if (m) {
      const indent = m[1].length;
      if (!mindent) {
        // this is the first indented line
        mindent = indent;
      } else {
        mindent = Math.min(mindent, indent);
      }
    }
  }

  if (mindent !== null) {
    const m = mindent; // appease TypeScript
    result = lines
      // https://github.com/typescript-eslint/typescript-eslint/issues/7140
      // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
      .map((l) => (l[0] === " " || l[0] === "\t" ? l.slice(m) : l))
      .join("\n");
  }

  return (
    result
      // dedent eats leading and trailing whitespace too
      .trim()
      // handle escaped newlines at the end to ensure they don't get stripped too
      .replace(/\\n/g, "\n")
  );
}


function openAIRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    return fn().catch((error) => {
        if (retries > 0) {
            // Exponential backoff
            const delay = 2 ** (3 - retries) * 1000;
            console.error(`Retrying OpenAI request in ${delay}ms, ${retries} retries left`);
            return new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
                openAIRetry(fn, retries - 1)
            );
        } else {
            throw error;
        }
    });
}

async function openAIRequest(params: CreateChatCompletionRequest) {
    const resp = await openai.createChatCompletion(params);
    if (resp.status !== 200) {
        console.error(`Got ${resp.status} (${resp.statusText}) response from OpenAI API`);
        if (resp.data) {
            console.error(resp.data);
        }
        throw new Error(`Got ${resp.status} (${resp.statusText}) response from OpenAI API`);
    }
    if (!resp.data) {
        throw new Error('No data in OpenAI response');
    }
    return resp.data;
}


// read in every .txt file in subdirectories of data/
async function getFiles(): Promise<{ year: string, fileName: string, fileContents: string }[]> {
    const files: { year: string, fileName: string, fileContents: string }[] = [];
    for await (const year of Deno.readDir("data/PFD_docs")) {
        if (year.isDirectory) {
            for await (const fileEntry of Deno.readDir(`data/PFD_docs/${year.name}`)) {
                // check file is .txt
                if (fileEntry.isFile && fileEntry.name.endsWith(".txt")) {
                    const fileContents = await Deno.readTextFile(`data/PFD_docs/${year.name}/${fileEntry.name}`);
                    files.push({ year: year.name, fileName: fileEntry.name, fileContents});
                }
            }
        }
    }
    return files;
}


// and send the content to GPT-4 followed by the question: "did this person die as a result of a delayed ambulance?"
// then log the response

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (OPENAI_API_KEY === undefined) {
  console.error("OPENAI_API_KEY not set in environment variable");
  Deno.exit(1);
}

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

const files = await getFiles();
for (const { year, fileName, fileContents } of files) {
    if (fileContents.trim() === "") {
        console.error(`EMPTY FILE ${fileName}`);
        continue;
    }
    const systemPrompt: ChatCompletionRequestMessage = {
        role: "system",
        content: dedent`You are a helpful assistant for investigative journalism.
        The journalist will provide you with a coroner's report, delimited with triple quotes (""").
        You will answer a question about the contents of the report.
    `
    };
    const prompt = `This is a coronor's report about a person who died in ${year}:\n\n"""\n${fileContents.trim()}\n"""\n\nDid this person die as a result of a delayed ambulance? Please answer simply "YES" or "NO", in all caps, without punctuation.`;
    console.error(`Filename: ${fileName}`);
    console.error("Prompt:");
    console.error(prompt);
    const completionRequest: CreateChatCompletionRequest = {
        model: "gpt-3.5-turbo-16k",
        messages: [systemPrompt, { role: "user", content: prompt }]
    };

    let data;
    try {
        data = await openAIRetry(() => openAIRequest(completionRequest));
    } catch (error) {
        console.error(`Failed on file ${fileName}: `, error);
        continue;
    }
    
    const yesNo = data?.choices[0]?.message?.content;

    // Get tokens from OpenAI response
    const usage = data?.usage;
    console.error(`Tokens used: ${JSON.stringify(usage)}`);

    console.log(JSON.stringify({ year, fileName: fileName.replace(".txt", ".pdf"), yesNo }));
    console.error("=====================================");
};

