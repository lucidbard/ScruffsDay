import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
config({ path: path.resolve(PROJECT_ROOT, '.env') });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const server = new Server(
  { name: 'gemini-image', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_image_gemini',
      description:
        'Generate an image using Google Gemini (Imagen 3). ' +
        'Saves the result to the project assets directory.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Image generation prompt',
          },
          output_path: {
            type: 'string',
            description:
              'Relative path from project root to save the image (e.g. "assets/items/my-item.png")',
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '3:4', '4:3', '9:16', '16:9'],
            description: 'Aspect ratio (default: 1:1)',
          },
        },
        required: ['prompt', 'output_path'],
      },
    },
    {
      name: 'edit_image_gemini',
      description:
        'Edit an existing image using Gemini with a text prompt. ' +
        'Provide an input image and instructions for how to modify it.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Edit instructions (e.g. "remove the background", "make it more vibrant")',
          },
          input_path: {
            type: 'string',
            description: 'Relative path to the source image',
          },
          output_path: {
            type: 'string',
            description: 'Relative path to save the edited image',
          },
        },
        required: ['prompt', 'input_path', 'output_path'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'generate_image_gemini') {
    return await generateImage(args);
  } else if (name === 'edit_image_gemini') {
    return await editImage(args);
  }
  throw new Error(`Unknown tool: ${name}`);
});

async function generateImage(args) {
  const { prompt, output_path, aspect_ratio } = args;
  const absPath = path.resolve(PROJECT_ROOT, output_path);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
      generationConfig: { responseModalities: ['image', 'text'] },
    });

    const response = await model.generateContent(prompt);
    const parts = response.response.candidates[0].content.parts;

    for (const part of parts) {
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(absPath, buffer);
        return {
          content: [
            {
              type: 'text',
              text: `Image saved to ${output_path} (gemini-2.0-flash, ${aspect_ratio || '1:1'})`,
            },
          ],
        };
      }
    }

    // Fallback: try Imagen 3 via the REST API
    const imagenResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspect_ratio || '1:1',
          },
        }),
      },
    );

    const imagenData = await imagenResponse.json();
    if (imagenData.predictions?.[0]?.bytesBase64Encoded) {
      const buffer = Buffer.from(imagenData.predictions[0].bytesBase64Encoded, 'base64');
      fs.writeFileSync(absPath, buffer);
      return {
        content: [
          {
            type: 'text',
            text: `Image saved to ${output_path} (imagen-3, ${aspect_ratio || '1:1'})`,
          },
        ],
      };
    }

    throw new Error('No image data in response');
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

async function editImage(args) {
  const { prompt, input_path, output_path } = args;
  const absInput = path.resolve(PROJECT_ROOT, input_path);
  const absOutput = path.resolve(PROJECT_ROOT, output_path);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  try {
    const imageBytes = fs.readFileSync(absInput);
    const base64 = imageBytes.toString('base64');
    const ext = path.extname(input_path).slice(1) || 'png';
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
      generationConfig: { responseModalities: ['image', 'text'] },
    });

    const response = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt,
    ]);

    const parts = response.response.candidates[0].content.parts;
    for (const part of parts) {
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(absOutput, buffer);
        return {
          content: [
            { type: 'text', text: `Edited image saved to ${output_path}` },
          ],
        };
      }
    }

    throw new Error('No image data in edit response');
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
