import OpenAI from "npm:openai@4.44";
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "npm:openai@4.44/resources/chat/completions";


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
    if (error instanceof OpenAI.APIError) {
      console.error(`ERROR calling OpenAI: ${error.status} ${error.name} ${error.message}`);
    }
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
 
// Delay due to not space at hospital
// Delay, other (official protocol)
// Delay, category
// Call handling
// Delay, category, (private ambulance no equipped)
// Not space in hospital
// Intra hospital handover slow
// Delay, Category
// Lack of resources
// Communication
// Call handling, category
// Wrong procedure/medication
// Communication, category
// Lack of training/knowledge
// Other (official protocol)
// Category
// Lack of training/knowledge, Wrong procedure/medication
// Other (Third party call)
// Delay, communication, category
// Other (official protocol), communication
// Category, shortages staff
// Delay due to not space at hospital, wrong procedure
// Delay, wrong procedure/medication
// Delay, Communication
// Other (dispute with parents)
// Category, Lack of training/knowledge
// Communication, lack of training/knowledge

type File = { year: string, name: string, originalNameRoot: string, originalPdfName: string, contents: string };
// read in every .txt file in subdirectories of data/
async function getFiles(): Promise<File[]> {
    const files: File[] = [];
    for await (const year of Deno.readDir("data/PFD_docs")) {
        if (year.isDirectory) {
            for await (const fileEntry of Deno.readDir(`data/PFD_docs/${year.name}`)) {
                // check file is .txt
                if (fileEntry.isFile && fileEntry.name.startsWith("ocr-") && fileEntry.name.endsWith(".txt")) {
                  const contents = await Deno.readTextFile(`data/PFD_docs/${year.name}/${fileEntry.name}`);
                  files.push({
                    year: year.name,
                    name: fileEntry.name,
                    originalPdfName: fileEntry.name.replace(/^ocr-/, "").replace(/\.pdf$/, ""),
                    originalNameRoot: fileEntry.name.replace(/^ocr-/, "").replace(/\.txt$/, ""),
                    contents
                  });
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

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const files = await getFiles();
for (const file of files) {
    if (file.contents.trim() === "") {
        console.error(`EMPTY FILE ${file.name}`);
        continue;
    }
    const systemPrompt: ChatCompletionMessageParam = {
        role: "system",
        content: dedent`You are a document classifier for use in investigative journalism.
        The journalist will provide you with a coroner's report, delimited with triple quotes (""").
        You will answer a yes/no question about the contents of the report.
        You must only answer YES or NO.
    `
    };
    const prompt = `This is a coronor's report about a person who died in ${file.year}:\n\n"""\n${file.contents.trim()}\n"""\n\nDoes the report mention a problem with the ambulance service, such as a delay, mistake, or capacity issue? Please answer simply "YES" or "NO", in all caps, without punctuation.`;
    console.error(`Filename: ${name}`);
    console.error("Prompt:");
    console.error(prompt);
    const completionRequest: ChatCompletionCreateParamsNonStreaming = {
        model: "gpt-4-turbo",
        messages: [systemPrompt, { role: "user", content: prompt }]
    };

    let data: OpenAI.Chat.Completions.ChatCompletion;
    try {
        data = await openAIRetry(() => openai.chat.completions.create(completionRequest));
    } catch (error) {
      console.error(`Failed on file ${name}: `, error);
      continue;
    }
    
    const yesNo = data?.choices[0]?.message?.content;

    // Get tokens from OpenAI response
    const usage = data?.usage;
    console.error(`Tokens used: ${JSON.stringify(usage)}`);

    console.log(JSON.stringify({ ...file, yesNo }));
    console.error("=====================================");
};

