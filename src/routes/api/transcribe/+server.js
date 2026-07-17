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
    
    const prompt = `You are a strict transcription and translation utility. Listen to the provided audio spoken in Hazara Hindko (the specific Hindko dialect spoken in the Hazara region of Pakistan KPK). 

CRITICAL INSTRUCTION FOR "EXACT": Your EXACT output MUST be a strict, literal phonetic transcription of the audio. Write exactly the sounds the speaker makes in Roman script. Do NOT translate, correct, or "Urdu-ify" the words. For example, if they say "krdain", do NOT write "kar rahe", write "krdain". If they say "gande", write "gande" (which will be corrected to kendey). Do not leak standard Urdu into the EXACT output.

Apply these specific spelling rules ONLY to your EXACT transcription (Hazara Hindko), DO NOT apply them to the ROMAN translation (Roman Urdu): where there is "vaddi" change it to "baddi", where there is "vekhde" change it to "dekhde", where there is "jeda" change it to "jerha", where there is "chhod" change it to "chorh", where there is "jane" change it to "julden", where there is "vi" change it to "b", where there is "rehnen" change it to "rehden", where there is "ajda" change it to "ajra", where there is "ana" change it to "arna", where there is "ji" change it to "g", where there is "gande" change it to "kendey", where there is "duji" change it to "doi", and where there is "bhan" change it to "phan".

IMPORTANT: You must transcribe and translate the ENTIRE audio. Do not summarize, do not skip any parts, and do not stop early. Ensure both EXACT and ROMAN sections are complete for the full duration of the audio.

You MUST output exactly in this text format and nothing else:
EXACT: <literal phonetic transcription of the ENTIRE audio in Roman script>
ROMAN: <the complete meaning translated into natural Roman Urdu script, without applying the spelling rules above>

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
