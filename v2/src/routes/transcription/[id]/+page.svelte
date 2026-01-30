<script lang="ts">
	import type { PageData } from './$types';
	import { ArrowLeft, Download, Clock, Users, Globe, FileText, Copy, Check } from 'lucide-svelte';

	let { data } = $props<{ data: PageData }>();
	const t = data.transcription;

	let copied = $state(false);
	let exportFormat = $state<'txt' | 'json' | 'srt'>('txt');

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	async function copyToClipboard() {
		await navigator.clipboard.writeText(t.fullText || '');
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function downloadExport() {
		let content: string;
		let filename: string;
		let mimeType: string;

		switch (exportFormat) {
			case 'json':
				content = JSON.stringify(t, null, 2);
				filename = `${t.title || 'transcription'}.json`;
				mimeType = 'application/json';
				break;
			case 'srt':
				content = generateSRT();
				filename = `${t.title || 'transcription'}.srt`;
				mimeType = 'text/srt';
				break;
			default:
				content = t.fullText || '';
				filename = `${t.title || 'transcription'}.txt`;
				mimeType = 'text/plain';
		}

		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function generateSRT(): string {
		if (!t.utterances.length) {
			return t.fullText || '';
		}

		return t.utterances
			.map((u, i) => {
				const startTime = formatSRTTime(u.start);
				const endTime = formatSRTTime(u.end);
				return `${i + 1}\n${startTime} --> ${endTime}\n${u.speaker}: ${u.text}\n`;
			})
			.join('\n');
	}

	function formatSRTTime(ms: number): string {
		const hours = Math.floor(ms / 3600000);
		const mins = Math.floor((ms % 3600000) / 60000);
		const secs = Math.floor((ms % 60000) / 1000);
		const millis = ms % 1000;
		return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
	}
</script>

<div class="min-h-screen" style="background: var(--bg-secondary)">
	<!-- Header -->
	<header
		class="flex items-center gap-4 px-4 py-3"
		style="background: var(--bg-primary); border-bottom: 1px solid var(--border-color)"
	>
		<a href="/" class="btn btn-secondary" style="padding: 0.5rem">
			<ArrowLeft size={20} />
		</a>
		<div class="flex-1 min-w-0">
			<h1 class="font-semibold truncate">{t.title || t.fileName || 'Transcription'}</h1>
			<p class="text-sm text-secondary">{t.fileName}</p>
		</div>
		<div class="flex items-center gap-2">
			<select bind:value={exportFormat} class="input" style="width: auto">
				<option value="txt">TXT</option>
				<option value="json">JSON</option>
				<option value="srt">SRT</option>
			</select>
			<button class="btn btn-primary" onclick={downloadExport}>
				<Download size={18} />
				Export
			</button>
		</div>
	</header>

	<main class="container py-4">
		<!-- Metadata -->
		<div class="card mb-4">
			<div class="flex flex-wrap gap-4">
				<div class="flex items-center gap-2 text-sm">
					<Clock size={16} style="color: var(--text-muted)" />
					<span>{formatDuration(t.duration)}</span>
				</div>
				{#if t.language}
					<div class="flex items-center gap-2 text-sm">
						<Globe size={16} style="color: var(--text-muted)" />
						<span>{t.language.toUpperCase()}</span>
					</div>
				{/if}
				{#if t.wordCount}
					<div class="flex items-center gap-2 text-sm">
						<FileText size={16} style="color: var(--text-muted)" />
						<span>{t.wordCount.toLocaleString()} words</span>
					</div>
				{/if}
				{#if t.utterances.length > 1}
					<div class="flex items-center gap-2 text-sm">
						<Users size={16} style="color: var(--text-muted)" />
						<span>{new Set(t.utterances.map((u) => u.speaker)).size} speakers</span>
					</div>
				{/if}
			</div>

			{#if t.companyNames.length > 0 || t.personNames.length > 0}
				<div class="flex flex-wrap gap-2 mt-3 pt-3" style="border-top: 1px solid var(--border-color)">
					{#each t.companyNames as company}
						<span class="badge" style="background: var(--bg-tertiary)">{company}</span>
					{/each}
					{#each t.personNames as person}
						<span class="badge" style="background: var(--bg-tertiary)">{person}</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Transcript -->
		<div class="card">
			<div class="flex items-center justify-between mb-4">
				<h2 class="font-semibold">Transcript</h2>
				<button class="btn btn-secondary text-sm" onclick={copyToClipboard}>
					{#if copied}
						<Check size={16} />
						Copied!
					{:else}
						<Copy size={16} />
						Copy
					{/if}
				</button>
			</div>

			{#if t.utterances.length > 1}
				<!-- Speaker diarization view -->
				<div class="flex flex-col gap-4">
					{#each t.utterances as utterance, i}
						<div class="flex gap-3">
							<div
								class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
								style="background: var(--bg-tertiary)"
							>
								{utterance.speaker.replace('Speaker ', '')}
							</div>
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-1">
									<span class="text-sm font-medium">{utterance.speaker}</span>
									<span class="text-xs text-muted">{formatTime(utterance.start)}</span>
								</div>
								<p class="text-sm" style="line-height: 1.6">{utterance.text}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<!-- Plain text view -->
				<div style="white-space: pre-wrap; line-height: 1.8">
					{t.fullText || 'No transcript available.'}
				</div>
			{/if}
		</div>
	</main>
</div>
