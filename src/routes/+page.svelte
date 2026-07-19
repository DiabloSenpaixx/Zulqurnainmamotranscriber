<script>
  import { onMount } from 'svelte';
  import { AudioRecorder } from '$lib/AudioRecorder';
  
  let recorder = null;
  let isRecording = $state(false);
  let timeElapsed = $state(0);
  let timerInterval = null;
  
  let selectedModel = $state('gemini-3.1-flash-lite');
  let audioSource = $state('microphone');
  let isProcessing = $state(false);
  let exactHindko = $state('');
  let romanUrdu = $state('');
  let errorMessage = $state('');
  let copiedHindko = $state(false);
  let copiedUrdu = $state(false);

  function copyToClipboard(text, type) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'hindko') {
        copiedHindko = true;
        setTimeout(() => copiedHindko = false, 2000);
      } else {
        copiedUrdu = true;
        setTimeout(() => copiedUrdu = false, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }

  onMount(async () => {
    // Load saved preferences
    const savedSource = localStorage.getItem('audioSource');
    if (savedSource) audioSource = savedSource;
    
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) selectedModel = savedModel;

    recorder = new AudioRecorder();
    
    // Check for recovered audio on initial load
    try {
      const recoveredBlob = await recorder.recover();
      if (recoveredBlob) {
         processAudio(recoveredBlob);
      }
    } catch(e) {
      console.error('Error recovering audio:', e);
    }
    
    // Handle visibility change to recover audio if tab was backgrounded/suspended
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === 'visible') {
        if (recorder && !isRecording) {
            try {
              const blob = await recorder.recover();
              if (blob) {
                  processAudio(blob);
              }
            } catch(e) {
              console.error('Error recovering audio on visibility change:', e);
            }
        }
      }
    });
  });

  function formatSentences(text, applyDictionary = true) {
    if (!text) return '';
    text = text.trim();
    if (!text) return '';
    
    if (applyDictionary) {
      text = text.replace(/\bvich\b/gi, match => match.charAt(0) === 'V' ? 'Bich' : 'bich');
      text = text.replace(/\bjyada\b/gi, match => match.charAt(0) === 'J' ? 'Zaida' : 'zaida');
      text = text.replace(/\bvaddi\b/gi, match => match.charAt(0) === 'V' ? 'Baddi' : 'baddi');
      text = text.replace(/\bjane\b/gi, match => match.charAt(0) === 'J' ? 'Julden' : 'julden');
      text = text.replace(/\bvi\b/gi, match => match.charAt(0) === 'V' ? 'B' : 'b');
      text = text.replace(/\brehnen\b/gi, match => match.charAt(0) === 'R' ? 'Rehden' : 'rehden');
      text = text.replace(/\bajda\b/gi, match => match.charAt(0) === 'A' ? 'Ajra' : 'ajra');
      text = text.replace(/\bana\b/gi, match => match.charAt(0) === 'A' ? 'Arna' : 'arna');
      text = text.replace(/\bji\b/gi, match => match.charAt(0) === 'J' ? 'G' : 'g');
      text = text.replace(/\bgande\b/gi, match => match.charAt(0) === 'G' ? 'Kendey' : 'kendey');
      text = text.replace(/\bduji\b/gi, match => match.charAt(0) === 'D' ? 'Doi' : 'doi');
      text = text.replace(/\bbhan\b/gi, match => match.charAt(0) === 'B' ? 'Phan' : 'phan');
      text = text.replace(/\bapni\b/gi, match => match.charAt(0) === 'A' ? 'Apri' : 'apri');
      text = text.replace(/\bghat\b/gi, match => match.charAt(0) === 'G' ? 'Khat' : 'khat');
      text = text.replace(/\bsakdi\b/gi, match => match.charAt(0) === 'S' ? 'Akdi' : 'akdi');
      text = text.replace(/\bwich\b/gi, match => match.charAt(0) === 'W' ? 'Bich' : 'bich');
      text = text.replace(/\btabla\b/gi, match => match.charAt(0) === 'T' ? 'Tavla' : 'tavla');
      text = text.replace(/\bbooda\b/gi, match => match.charAt(0) === 'B' ? 'Boota' : 'boota');
      text = text.replace(/\bbaqt\b/gi, match => match.charAt(0) === 'B' ? 'Vaqt' : 'vaqt');
      text = text.replace(/\bghr\b/gi, match => match.charAt(0) === 'G' ? 'Kaar' : 'kaar');
      text = text.replace(/\btrup\b/gi, match => match.charAt(0) === 'T' ? 'Trut' : 'trut');
      text = text.replace(/\bajle\b/gi, match => match.charAt(0) === 'A' ? 'Ajulai' : 'ajulai');
      text = text.replace(/\bsakda\b/gi, match => match.charAt(0) === 'S' ? 'Akda' : 'akda');
      text = text.replace(/\bparhaya\b/gi, match => match.charAt(0) === 'P' ? 'Parhalya' : 'parhalya');
      text = text.replace(/\bmut\b/gi, match => match.charAt(0) === 'M' ? 'Much' : 'much');
    }
    
    text = text.replace(/\ballah\b/gi, 'Allah');
    text = text.replace(/(^\s*|[.!?]\s+)(.)/g, (match, p1, p2) => p1 + p2.toUpperCase());
    
    if (!/[.!?]$/.test(text)) {
      text += '.';
    }
    
    return text;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  async function toggleRecording() {
    if (!recorder) return;
    
    if (isRecording) {
      // Stop recording
      isRecording = false;
      clearInterval(timerInterval);
      try {
        const audioBlob = await recorder.stop();
        if (audioBlob) {
          await processAudio(audioBlob);
        }
      } catch (err) {
        errorMessage = 'Failed to stop recording: ' + err.message;
      }
    } else {
      // Start recording
      exactHindko = '';
      romanUrdu = '';
      errorMessage = '';
      timeElapsed = 0;
      
      try {
        await recorder.start(audioSource, async (blob) => {
          // Triggered if the user stops sharing via browser's built-in "Stop sharing" UI
          isRecording = false;
          clearInterval(timerInterval);
          await processAudio(blob);
        });
        isRecording = true;
        timerInterval = setInterval(() => {
          timeElapsed++;
        }, 1000);
      } catch (err) {
        errorMessage = 'Microphone access denied or error: ' + err.message;
      }
    }
  }

  async function processAudio(blob) {
    isProcessing = true;
    errorMessage = '';
    
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    formData.append('model', selectedModel);
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const result = await response.json();
          throw new Error((result.error || 'Transcription failed') + (result.details ? ': ' + result.details : ''));
        }
        throw new Error('Transcription failed with status: ' + response.status);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let fullText = "";
      exactHindko = "";
      romanUrdu = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        fullText += decoder.decode(value, { stream: true });
        
        const exactMatch = fullText.match(/EXACT:\s*(.*?)(?=\nROMAN:|$)/s);
        const romanMatch = fullText.match(/ROMAN:\s*(.*)/s);
        
        if (exactMatch) {
          exactHindko = formatSentences(exactMatch[1].trim(), true);
        }
        if (romanMatch) {
          romanUrdu = formatSentences(romanMatch[1].trim(), false);
        }
      }
      
    } catch (err) {
      errorMessage = err.message;
    } finally {
      isProcessing = false;
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Convert File to a Blob-like format expected by processAudio, though File inherits from Blob
    await processAudio(file);
    
    // Reset the input so the same file can be selected again if needed
    event.target.value = '';
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('audioSource', audioSource);
      localStorage.setItem('selectedModel', selectedModel);
    }
  });
</script>

<div class="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
    <div class="max-w-xl mx-auto flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">Transcriber</h1>
      <select 
        bind:value={selectedModel}
        class="bg-gray-100 border-none text-sm rounded-lg focus:ring-2 focus:ring-blue-500 py-2 px-3 text-gray-700 outline-none appearance-none cursor-pointer"
      >
        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fully Paid)</option>
        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fully Paid)</option>
        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fully Paid)</option>
      </select>
    </div>
  </header>

  <main class="max-w-xl mx-auto px-4 py-8 flex flex-col items-center">
    
    <!-- Audio Source Toggle -->
    <div class="flex bg-gray-200 p-1 rounded-lg mb-8 text-sm w-full max-w-sm">
      <button 
        onclick={() => audioSource = 'microphone'}
        class="flex-1 py-1.5 rounded-md font-medium transition-colors {audioSource === 'microphone' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}"
      >
        Mic
      </button>
      <button 
        onclick={() => audioSource = 'browser'}
        class="flex-1 py-1.5 rounded-md font-medium transition-colors {audioSource === 'browser' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}"
      >
        Browser
      </button>
      <button 
        onclick={() => audioSource = 'file'}
        class="flex-1 py-1.5 rounded-md font-medium transition-colors {audioSource === 'file' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}"
      >
        File
      </button>
    </div>

    <!-- Record Button Area -->
    <div class="flex flex-col items-center justify-center py-6 w-full min-h-[220px]">
      {#if audioSource === 'file'}
        <label class="cursor-pointer group flex flex-col items-center justify-center w-full max-w-xs h-32 border-2 border-dashed border-gray-300 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all">
          <div class="flex flex-col items-center justify-center pt-5 pb-6">
            <svg class="w-8 h-8 mb-3 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <p class="mb-2 text-sm text-gray-500"><span class="font-semibold">Click to upload</span></p>
            <p class="text-xs text-gray-500">Audio or Video files</p>
          </div>
          <input type="file" accept="audio/*,video/*" class="hidden" onchange={handleFileUpload} />
        </label>
      {:else}
        <button 
          onclick={toggleRecording}
          class="relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ease-out outline-none focus:ring-4 focus:ring-offset-2 {isRecording ? 'bg-red-500 focus:ring-red-200 scale-105 shadow-lg shadow-red-200' : 'bg-gray-900 focus:ring-gray-300 hover:bg-gray-800 shadow-md'}"
          aria-label={isRecording ? "Stop Recording" : "Start Recording"}
        >
          {#if isRecording}
            <!-- Stop Square inside Red Button -->
            <div class="w-8 h-8 bg-white rounded-sm"></div>
            <!-- Pulse Effect -->
            <div class="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-20"></div>
          {:else}
            <!-- Mic Icon inside Dark Button -->
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
            </svg>
          {/if}
        </button>
        
        <div class="mt-6 text-2xl font-medium tracking-tighter text-gray-700 font-mono">
          {formatTime(timeElapsed)}
        </div>
        
        <div class="mt-2 text-sm font-medium {isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400'}">
          {isRecording ? 'Recording...' : 'Tap to Record'}
        </div>
      {/if}
    </div>

    <!-- Error Message -->
    {#if errorMessage}
      <div class="w-full p-4 mb-6 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
        {errorMessage}
      </div>
    {/if}

    <!-- Results Area -->
    <div class="w-full space-y-4">
      <!-- Exact Spoken Card -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-xs font-bold tracking-wider text-gray-400 uppercase">Exact Spoken (Hazara Hindko)</h2>
          {#if exactHindko && !isProcessing}
            <button 
              onclick={() => copyToClipboard(exactHindko, 'hindko')}
              class="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
              title="Copy to clipboard"
            >
              {#if copiedHindko}
                <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
              {/if}
            </button>
          {/if}
        </div>
        
        {#if isProcessing}
          <div class="animate-pulse flex flex-col space-y-2">
            <div class="h-4 bg-gray-100 rounded w-3/4"></div>
            <div class="h-4 bg-gray-100 rounded w-1/2"></div>
          </div>
        {:else if exactHindko}
          <p class="text-gray-800 text-lg leading-relaxed">{exactHindko}</p>
        {:else}
          <p class="text-gray-300 italic text-sm">Waiting for audio...</p>
        {/if}
      </div>

      <!-- Translation Card -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-xs font-bold tracking-wider text-gray-400 uppercase">Roman Urdu Translation</h2>
          {#if romanUrdu && !isProcessing}
            <button 
              onclick={() => copyToClipboard(romanUrdu, 'urdu')}
              class="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
              title="Copy to clipboard"
            >
              {#if copiedUrdu}
                <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
              {/if}
            </button>
          {/if}
        </div>
        
        {#if isProcessing}
          <div class="animate-pulse flex flex-col space-y-2">
            <div class="h-4 bg-gray-100 rounded w-full"></div>
            <div class="h-4 bg-gray-100 rounded w-5/6"></div>
          </div>
        {:else if romanUrdu}
          <p class="text-gray-800 text-lg leading-relaxed">{romanUrdu}</p>
        {:else}
          <p class="text-gray-300 italic text-sm">Translation will appear here.</p>
        {/if}
      </div>
    </div>

  </main>
</div>
