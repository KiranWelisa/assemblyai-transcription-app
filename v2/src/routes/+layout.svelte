<script lang="ts">
	import type { LayoutData } from './$types';
	import '../app.css';

	let { data, children } = $props<{ data: LayoutData; children: any }>();
</script>

<svelte:head>
	<title>Transcription Hub</title>
</svelte:head>

{@render children()}
