import { GoogleGenAI } from '@google/genai';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
  try {
    const data = await request.formData();
    const audioBlob = data.get('audio');
    const modelId = data.get('model');
    const model = modelId || 'gemini-2.5-flash';
    
    if (!audioBlob || !model) {
      return json({ error: 'Missing audio or model parameters.' }, { status: 400 });
    }

    const projectId = env.GOOGLE_CLOUD_PROJECT_ID;
    const location = env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    if (!projectId) {
      return json({ error: 'GOOGLE_CLOUD_PROJECT_ID is not configured on the server.' }, { status: 500 });
    }

    const buffer = await audioBlob.arrayBuffer();
    const base64Audio = Buffer.from(buffer).toString('base64');

    // In local development, use the file path
    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    // In Vercel (production), write the JSON string to a temp file and use that
    if (env.GOOGLE_CREDENTIALS_JSON) {
      const fs = await import('fs');
      const tempPath = '/tmp/google-credentials.json';
      fs.writeFileSync(tempPath, env.GOOGLE_CREDENTIALS_JSON);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
    }

    // Initialize the unified SDK
    let ai;
    if (env.GEMINI_API_KEY) {
      // Use Google AI Studio (Fastest, uses API Key)
      ai = new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY
      });
    } else {
      // Fallback to Vertex AI if no API key is provided
      ai = new GoogleGenAI({
        vertexai: true, 
        project: projectId,
        location: location
      });
    }
    
    const prompt = `You are a strict translation utility. Listen to the provided audio spoken in Hazara Hindko (the specific Hindko dialect spoken in the Hazara region of Pakistan KPK). Transliterate the exact spoken words into Roman script, and translate the meaning into Roman Urdu script. Apply these specific spelling rules to your transcription: where there is "vaddi" change it to "baddi", where there is "vekhde" change it to "dekhde", where there is "jeda" change it to "jerha", where there is "chhod" change it to "chorh", where there is "jane" change it to "julden", where there is "vi" change it to "b", where there is "rehnen" change it to "rehden", where there is "ajda" change it to "ajra", where there is "ana" change it to "arna", and where there is "ji" change it to "g". 

You MUST output exactly in this text format and nothing else:
EXACT: <literal transcription of the exact spoken words in Roman script>
ROMAN: <the meaning translated into Roman Urdu script>

Example output:
EXACT: tu kai krdain
ROMAN: tum kia kr rhai ho`;

    const stream = await ai.models.generateContentStream({
      model: model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Audio,
                mimeType: audioBlob.type || 'audio/webm'
              }
            }
          ]
        }
      ]
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(new TextEncoder().encode(chunk.text));
            }
          }
        } catch (e) {
          console.error("Stream generation error:", e);
          controller.error(e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return json({ error: 'Failed to transcribe audio.', details: error.message }, { status: 500 });
  }
}
