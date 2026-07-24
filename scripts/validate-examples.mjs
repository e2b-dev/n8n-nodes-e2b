import { readdir, readFile } from 'node:fs/promises';

const examplesDirectory = new URL('../docs/examples/', import.meta.url);
const exampleFiles = (await readdir(examplesDirectory))
  .filter((file) => /^\d-.*\.json$/.test(file))
  .sort();

for (const file of exampleFiles) {
  const workflow = JSON.parse(await readFile(new URL(file, examplesDirectory), 'utf8'));

  if (workflow.meta?.templateCredsSetupCompleted !== false) {
    throw new Error(`${file}: meta.templateCredsSetupCompleted must be false`);
  }

  for (const node of workflow.nodes) {
    if (node.type === '@e2b/n8n-nodes-e2b.e2b' || node.type === '@e2b/n8n-nodes-e2b.e2bTool') {
      const credential = node.credentials?.e2bApi;
      if (
        credential?.id !== 'REPLACE_WITH_YOUR_CREDENTIAL_ID' ||
        credential.name !== 'E2B API account'
      ) {
        throw new Error(`${file}: ${node.name} must declare the E2B marketplace credential placeholder`);
      }
    }

    if (node.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi') {
      const credential = node.credentials?.openAiApi;
      if (
        credential?.id !== 'REPLACE_WITH_YOUR_OPENAI_CREDENTIAL_ID' ||
        credential.name !== 'OpenAi account'
      ) {
        throw new Error(`${file}: ${node.name} must declare the OpenAI marketplace credential placeholder`);
      }
    }
  }
}

console.log(`Validated ${exampleFiles.length} marketplace workflow examples`);
