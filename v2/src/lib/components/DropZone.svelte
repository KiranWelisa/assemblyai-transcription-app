<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Upload, FileAudio, Loader2, Cloud } from 'lucide-svelte';

	interface Props {
		accessToken?: string;
	}

	let { accessToken }: Props = $props();

	const dispatch = createEventDispatcher<{
		transcriptionStart: { fileName: string; assemblyAiId: string };
		compressionProgress: { progress: number };
	}>();

	let isDragOver = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadStatus = $state<'idle' | 'compressing' | 'uploading' | 'transcribing'>('idle');
	let error = $state<string | null>(null);
	let ffmpegRef = $state<any>(null);
	let ffmpegLoading = $state(false);

	const SUPPORTED_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a', 'audio/ogg', 'audio/webm'];
	const SUPPORTED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
	const MAX_SIZE = 100 * 1024 * 1024; // 100MB

	function isVideoFile(file: File): boolean {
		return SUPPORTED_VIDEO.includes(file.type) || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);
	}

	function isAudioFile(file: File): boolean {
		return SUPPORTED_AUDIO.includes(file.type) || /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name);
	}

	// Load FFmpeg from CDN
	async function loadFFmpeg() {
		if (ffmpegRef) return ffmpegRef;
		if (ffmpegLoading) return null;

		ffmpegLoading = true;
		try {
			// Load script
			await new Promise<void>((resolve, reject) => {
				if (document.querySelector('script[src*="ffmpeg"]')) {
					resolve();
					return;
				}
				const script = document.createElement('script');
				script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
				script.onload = () => resolve();
				script.onerror = reject;
				document.head.appendChild(script);
			});

			const FFmpegWASM = (window as any).FFmpegWASM;
			if (!FFmpegWASM?.FFmpeg) throw new Error('FFmpeg not loaded');

			const ffmpeg = new FFmpegWASM.FFmpeg();

			// Load core from CDN
			const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
			const toBlobURL = async (url: string, type: string) => {
				const res = await fetch(url);
				const blob = await res.blob();
				return URL.createObjectURL(new Blob([blob], { type }));
			};

			await ffmpeg.load({
				coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
				wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
			});

			ffmpegRef = ffmpeg;
			return ffmpeg;
		} catch (err) {
			console.error('Failed to load FFmpeg:', err);
			return null;
		} finally {
			ffmpegLoading = false;
		}
	}

	// Compress video to MP3
	async function compressVideo(file: File): Promise<File> {
		dispatch('compressionProgress', { progress: 10 });

		const ffmpeg = await loadFFmpeg();
		if (!ffmpeg) throw new Error('Failed to load video compressor');

		dispatch('compressionProgress', { progress: 20 });

		const inputName = `input_${Date.now()}.${file.name.split('.').pop()}`;
		const outputName = `output_${Date.now()}.mp3`;

		// Write input file
		const arrayBuffer = await file.arrayBuffer();
		await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));

		dispatch('compressionProgress', { progress: 30 });

		// Track progress
		ffmpeg.on('progress', ({ progress }: { progress: number }) => {
			dispatch('compressionProgress', { progress: 30 + progress * 50 });
		});

		// Compress to MP3
		await ffmpeg.exec([
			'-i', inputName,
			'-vn',
			'-acodec', 'libmp3lame',
			'-ab', '128k',
			'-ar', '44100',
			'-ac', '2',
			outputName
		]);

		dispatch('compressionProgress', { progress: 85 });

		// Read output
		const data = await ffmpeg.readFile(outputName);
		const arrayData = data.buffer || data;
		const blob = new Blob([arrayData], { type: 'audio/mpeg' });
		const compressedFile = new File([blob], outputName, { type: 'audio/mpeg' });

		// Cleanup
		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);

		dispatch('compressionProgress', { progress: 95 });

		return compressedFile;
	}

	// Upload to Google Drive
	async function uploadToDrive(file: File): Promise<string> {
		const metadata = {
			name: file.name,
			mimeType: file.type
		};

		const form = new FormData();
		form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
		form.append('file', file);

		const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`
			},
			body: form
		});

		if (!res.ok) throw new Error('Upload failed');
		const data = await res.json();
		return data.id;
	}

	// Make file public and get URL
	async function makePublic(fileId: string): Promise<string> {
		await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ role: 'reader', type: 'anyone' })
		});

		return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
	}

	// Start transcription
	async function startTranscription(audioUrl: string, fileName: string, fileId: string) {
		const res = await fetch('/api/transcriptions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ audioUrl, fileName, driveFileId: fileId })
		});

		if (!res.ok) throw new Error('Failed to start transcription');
		const data = await res.json();
		return data.assemblyAiId;
	}

	// Handle file upload
	async function handleFile(file: File) {
		if (!isAudioFile(file) && !isVideoFile(file)) {
			error = 'Please upload an audio or video file';
			return;
		}

		if (file.size > MAX_SIZE && !isVideoFile(file)) {
			error = 'File size must be under 100MB';
			return;
		}

		error = null;
		isUploading = true;
		uploadProgress = 0;

		try {
			let processedFile = file;

			// Compress video to MP3
			if (isVideoFile(file)) {
				uploadStatus = 'compressing';
				processedFile = await compressVideo(file);
			}

			// Upload to Drive
			uploadStatus = 'uploading';
			uploadProgress = 10;
			const fileId = await uploadToDrive(processedFile);
			uploadProgress = 50;

			// Make public and get URL
			const audioUrl = await makePublic(fileId);
			uploadProgress = 70;

			// Start transcription
			uploadStatus = 'transcribing';
			const assemblyAiId = await startTranscription(audioUrl, file.name, fileId);
			uploadProgress = 100;

			dispatch('transcriptionStart', { fileName: file.name, assemblyAiId });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			isUploading = false;
			uploadStatus = 'idle';
			uploadProgress = 0;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFile(file);
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
		input.value = '';
	}

	function openDrivePicker() {
		// Google Drive Picker integration - simplified
		alert('Google Drive Picker wordt nog geïmplementeerd');
	}
</script>

<div
	class="dropzone"
	class:dragover={isDragOver}
	ondragover={(e) => {
		e.preventDefault();
		isDragOver = true;
	}}
	ondragleave={() => (isDragOver = false)}
	ondrop={handleDrop}
	role="button"
	tabindex="0"
>
	{#if isUploading}
		<div class="flex flex-col items-center gap-3">
			<Loader2 size={48} class="animate-spin" style="color: var(--accent)" />
			<p class="font-medium">
				{#if uploadStatus === 'compressing'}
					Compressing video...
				{:else if uploadStatus === 'uploading'}
					Uploading to Drive...
				{:else}
					Starting transcription...
				{/if}
			</p>
			<div class="progress-bar" style="max-width: 200px">
				<div
					class="progress-bar-fill"
					class:compression={uploadStatus === 'compressing'}
					style="width: {uploadProgress}%"
				></div>
			</div>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-3">
			<div class="flex gap-4 items-center">
				<Upload size={32} style="color: var(--text-muted)" />
				<span style="color: var(--text-muted)">or</span>
				<Cloud size={32} style="color: var(--text-muted)" />
			</div>

			<p class="font-medium">
				Drop audio/video file here or
				<label class="cursor-pointer" style="color: var(--accent)">
					browse
					<input
						type="file"
						accept="audio/*,video/*"
						class="hidden"
						onchange={handleFileInput}
						style="display: none"
					/>
				</label>
			</p>

			<p class="text-sm text-muted">
				Supports MP3, WAV, M4A, MP4, MOV • Videos are auto-compressed
			</p>

			<button class="btn btn-secondary mt-2" onclick={openDrivePicker}>
				<Cloud size={18} />
				Choose from Google Drive
			</button>
		</div>
	{/if}

	{#if error}
		<p class="text-sm mt-3" style="color: var(--error)">{error}</p>
	{/if}
</div>
