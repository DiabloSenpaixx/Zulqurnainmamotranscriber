export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.dbName = 'audio_chunks_db';
    this.storeName = 'chunks';
    this.db = null;
    this.isRecording = false;
    this.chunks = [];
  }

  async initDB() {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { autoIncrement: true });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onerror = (e) => {
        console.error('IndexedDB init error:', e);
        reject(e);
      };
    });
  }

  async clearChunks() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async saveChunk(blob) {
    if (!this.db) await this.initDB();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.add(blob);
  }

  async getAllChunks() {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e);
    });
  }

  async start(sourceType = 'microphone', onStopFromBrowser = null) {
    await this.initDB();
    await this.clearChunks(); // clear any previous session
    this.chunks = []; // reset in-memory chunks
    
    if (sourceType === 'browser') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true,
        audio: true 
      });
      
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error("No audio track detected. Make sure to share a tab and check 'Share tab audio'.");
      }
      
      this.stream = new MediaStream([audioTracks[0]]);
      displayStream.getVideoTracks().forEach(t => t.stop());
      
      audioTracks[0].onended = async () => {
        if (this.isRecording) {
          const blob = await this.stop();
          if (onStopFromBrowser && blob) {
             onStopFromBrowser(blob);
          }
        }
      };
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true
        } 
      });
    }
    
    const options = { mimeType: 'audio/webm', audioBitsPerSecond: 16000 };
    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options);
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.stream);
    }
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data); // reliable in-memory array
        this.saveChunk(e.data);   // background backup for crash recovery
      }
    };

    // Start without timeslice to guarantee a single, perfectly formed WebM blob.
    // Concatenating WebM chunks often corrupts the container for AI APIs.
    this.mediaRecorder.start();
    this.isRecording = true;
  }

  async stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.stream.getTracks().forEach(track => track.stop());
        
        if (this.chunks.length === 0) {
           resolve(null);
           return;
        }
        
        // Build the final blob from the exact in-memory chunks
        const blob = new Blob(this.chunks, { type: this.chunks[0].type });
        this.chunks = [];
        await this.clearChunks(); // wipe DB since we successfully stopped
        resolve(blob);
      };
      
      this.mediaRecorder.stop();
    });
  }
  
  async recover() {
    await this.initDB();
    const chunks = await this.getAllChunks();
    if (chunks && chunks.length > 0) {
      const blob = new Blob(chunks, { type: chunks[0].type });
      await this.clearChunks();
      return blob;
    }
    return null;
  }
}
