<script lang="ts">
	import type { Transcription } from '$lib/types';
	import { FileAudio, Clock, Users, Loader2 } from 'lucide-svelte';

	interface Props {
		transcription: Transcription;
	}

	let { transcription }: Props = $props();

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

		return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
	}

	function handleClick() {
		if (transcription.status === 'completed') {
			window.location.href = `/transcription/${transcription.id}`;
		}
	}

	function handleMarkViewed() {
		if (transcription.isNew) {
			fetch(`/api/transcriptions/${transcription.id}/mark-viewed`, { method: 'POST' });
		}
	}
</script>

<button
	class="card cursor-pointer transition text-left w-full"
	onclick={handleClick}
	onfocus={handleMarkViewed}
	onmouseenter={handleMarkViewed}
	disabled={transcription.status !== 'completed'}
	style={transcription.isNew ? 'border-left: 3px solid var(--success)' : ''}
>
	<div class="flex items-start gap-3 mb-3">
		<div
			class="rounded-full p-2"
			style="background: {transcription.status === 'completed' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'}"
		>
			{#if transcription.status === 'processing'}
				<Loader2 size={20} class="animate-spin" style="color: var(--accent)" />
			{:else}
				<FileAudio size={20} style="color: var(--text-muted)" />
			{/if}
		</div>

		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 mb-1">
				{#if transcription.isNew}
					<span class="badge badge-new">NEW</span>
				{/if}
				{#if transcription.status === 'processing'}
					<span class="badge badge-processing">Processing</span>
				{/if}
			</div>

			<h3 class="font-medium truncate">
				{transcription.title || transcription.fileName || 'Untitled'}
			</h3>

			{#if transcription.preview}
				<p class="text-sm text-secondary truncate mt-1">{transcription.preview}</p>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-between text-xs text-muted">
		<div class="flex items-center gap-3">
			<span class="flex items-center gap-1">
				<Clock size={14} />
				{formatDuration(transcription.duration)}
			</span>
			{#if transcription.utterances.length > 1}
				<span class="flex items-center gap-1">
					<Users size={14} />
					{transcription.utterances.length} speakers
				</span>
			{/if}
		</div>
		<span>{formatDate(transcription.createdAt)}</span>
	</div>

	{#if transcription.companyNames.length > 0 || transcription.personNames.length > 0}
		<div class="flex flex-wrap gap-1 mt-2">
			{#each transcription.companyNames.slice(0, 2) as company}
				<span class="badge" style="background: var(--bg-tertiary); font-size: 10px">{company}</span>
			{/each}
			{#each transcription.personNames.slice(0, 2) as person}
				<span class="badge" style="background: var(--bg-tertiary); font-size: 10px">{person}</span>
			{/each}
		</div>
	{/if}
</button>
