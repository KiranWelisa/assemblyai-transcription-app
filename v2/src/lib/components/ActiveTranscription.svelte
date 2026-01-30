<script lang="ts">
	import { Loader2, CheckCircle, Clock } from 'lucide-svelte';

	interface Props {
		status: string;
		fileName: string;
		startTime: number;
	}

	let { status, fileName, startTime }: Props = $props();

	let elapsedTime = $state(0);

	$effect(() => {
		if (status === 'completed') return;

		const interval = setInterval(() => {
			elapsedTime = Math.floor((Date.now() - startTime) / 1000);
		}, 1000);

		return () => clearInterval(interval);
	});

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins === 0) return `${secs}s`;
		return `${mins}m ${secs}s`;
	}

	const isCompleted = $derived(status === 'completed');
	const progress = $derived(status === 'completed' ? 100 : 50);

	const statusMessage = $derived(() => {
		if (status === 'uploading') return 'Uploading to Drive...';
		if (status === 'transcribing') return 'Sending to AssemblyAI...';
		if (status === 'completed') return 'Complete!';
		return 'Processing...';
	});
</script>

<div
	class="card"
	style={isCompleted ? 'box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3)' : ''}
>
	<div class="flex items-center gap-3 mb-4">
		{#if isCompleted}
			<div
				class="rounded-full p-2"
				style="background: rgba(16, 185, 129, 0.1)"
			>
				<CheckCircle size={24} style="color: var(--success)" />
			</div>
		{:else}
			<div
				class="rounded-full p-2"
				style="background: rgba(59, 130, 246, 0.1)"
			>
				<Loader2 size={24} class="animate-spin" style="color: var(--accent)" />
			</div>
		{/if}

		<div class="flex-1 min-w-0">
			<h3 class="font-semibold">
				{#if isCompleted}
					Transcription Complete
				{:else}
					Transcription in Progress
				{/if}
			</h3>
			<p class="text-sm text-secondary truncate">{fileName}</p>
		</div>
	</div>

	<!-- Progress bar -->
	<div class="mb-3">
		<div class="flex items-center justify-between text-sm text-secondary mb-2">
			<span>{statusMessage()}</span>
			<span>{Math.round(progress)}%</span>
		</div>
		<div class="progress-bar">
			<div
				class="progress-bar-fill"
				class:success={isCompleted}
				style="width: {progress}%"
			></div>
		</div>
	</div>

	<!-- Stats -->
	<div class="flex items-center justify-between text-xs text-muted">
		<span class="flex items-center gap-1">
			<Clock size={14} />
			Elapsed: {formatTime(elapsedTime)}
		</span>
		{#if !isCompleted}
			<span style="color: var(--accent)">
				Processing...
			</span>
		{/if}
	</div>
</div>
