<script lang="ts">
	import type { PageData } from './$types';
	import type { Transcription } from '$lib/types';
	import DropZone from '$lib/components/DropZone.svelte';
	import TranscriptionCard from '$lib/components/TranscriptionCard.svelte';
	import Header from '$lib/components/Header.svelte';
	import ActiveTranscription from '$lib/components/ActiveTranscription.svelte';

	let { data } = $props<{ data: PageData }>();

	let transcriptions = $state<Transcription[]>(data.transcriptions);
	let activeTranscription = $state<{
		status: string;
		fileName: string;
		startTime: number;
		compressionProgress: number;
	} | null>(null);
	let searchQuery = $state('');
	let darkMode = $state(false);

	// SSE connection for realtime updates
	$effect(() => {
		const eventSource = new EventSource('/api/sse');

		eventSource.onmessage = (event) => {
			const message = JSON.parse(event.data);

			if (message.type === 'transcription_completed') {
				// Update the transcription in the list
				transcriptions = transcriptions.map((t) =>
					t.id === message.data.id ? { ...t, ...message.data, status: 'completed' } : t
				);
				// Clear active transcription if it matches
				if (activeTranscription?.fileName === message.data.fileName) {
					activeTranscription = { ...activeTranscription, status: 'completed' };
					setTimeout(() => {
						activeTranscription = null;
					}, 3000);
				}
			}

			if (message.type === 'title_generated') {
				transcriptions = transcriptions.map((t) =>
					t.id === message.data.id ? { ...t, title: message.data.title } : t
				);
			}
		};

		eventSource.onerror = () => {
			console.log('SSE connection error, will retry...');
		};

		return () => eventSource.close();
	});

	// Toggle dark mode
	$effect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	// Filter transcriptions
	const filteredTranscriptions = $derived(
		transcriptions.filter((t) => {
			if (!searchQuery) return true;
			const query = searchQuery.toLowerCase();
			return (
				t.title?.toLowerCase().includes(query) ||
				t.fileName?.toLowerCase().includes(query) ||
				t.preview?.toLowerCase().includes(query)
			);
		})
	);

	const newCount = $derived(transcriptions.filter((t) => t.isNew).length);

	function handleTranscriptionStart(event: CustomEvent<{ fileName: string; assemblyAiId: string }>) {
		const { fileName, assemblyAiId } = event.detail;

		// Add to local list immediately
		const newTranscription: Transcription = {
			id: crypto.randomUUID(),
			assemblyAiId,
			userEmail: data.user!.email,
			title: null,
			fileName,
			language: null,
			duration: null,
			wordCount: null,
			preview: null,
			fullText: null,
			utterances: [],
			companyNames: [],
			personNames: [],
			status: 'processing',
			meetingType: null,
			isNew: true,
			viewedAt: null,
			assemblyCreatedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		transcriptions = [newTranscription, ...transcriptions];

		activeTranscription = {
			status: 'transcribing',
			fileName,
			startTime: Date.now(),
			compressionProgress: 0
		};
	}

	function handleCompressionProgress(event: CustomEvent<{ progress: number }>) {
		if (activeTranscription) {
			activeTranscription = {
				...activeTranscription,
				status: 'compressing',
				compressionProgress: event.detail.progress
			};
		}
	}

	function handleMarkAllViewed() {
		transcriptions = transcriptions.map((t) => ({ ...t, isNew: false }));
		fetch('/api/transcriptions/mark-all-viewed', { method: 'POST' });
	}
</script>

<div class="min-h-screen" class:dark={darkMode}>
	<Header user={data.user} {darkMode} onToggleDarkMode={() => (darkMode = !darkMode)} />

	<main class="container py-4">
		<!-- Upload Section -->
		<section class="mb-6">
			<DropZone
				accessToken={data.accessToken}
				on:transcriptionStart={handleTranscriptionStart}
				on:compressionProgress={handleCompressionProgress}
			/>
		</section>

		<!-- Active Transcription -->
		{#if activeTranscription}
			<section class="mb-6">
				<ActiveTranscription
					status={activeTranscription.status}
					fileName={activeTranscription.fileName}
					startTime={activeTranscription.startTime}
					compressionProgress={activeTranscription.compressionProgress}
				/>
			</section>
		{/if}

		<!-- Transcriptions Header -->
		<section class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-3">
				<h2 class="text-xl font-semibold">Transcriptions</h2>
				{#if newCount > 0}
					<span class="badge badge-new">{newCount} NEW</span>
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<input
					type="text"
					placeholder="Search..."
					class="input"
					style="max-width: 200px"
					bind:value={searchQuery}
				/>
				{#if newCount > 0}
					<button class="btn btn-secondary text-sm" onclick={handleMarkAllViewed}>
						Mark all read
					</button>
				{/if}
			</div>
		</section>

		<!-- Transcription Grid -->
		<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredTranscriptions as transcription (transcription.id)}
				<TranscriptionCard {transcription} />
			{/each}
		</section>

		{#if filteredTranscriptions.length === 0}
			<div class="card text-center py-12 text-secondary">
				{#if searchQuery}
					<p>No transcriptions match your search.</p>
				{:else}
					<p>No transcriptions yet. Drop a file above to get started!</p>
				{/if}
			</div>
		{/if}
	</main>
</div>
