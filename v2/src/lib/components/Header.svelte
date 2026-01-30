<script lang="ts">
	import { Sun, Moon, LogOut } from 'lucide-svelte';

	interface Props {
		user: { email: string; name?: string; image?: string } | null;
		darkMode: boolean;
		onToggleDarkMode: () => void;
	}

	let { user, darkMode, onToggleDarkMode }: Props = $props();
</script>

<header
	class="flex items-center justify-between px-4 py-3"
	style="background: var(--bg-primary); border-bottom: 1px solid var(--border-color)"
>
	<div class="flex items-center gap-3">
		<h1 class="text-xl font-bold" style="color: var(--accent)">Transcription Hub</h1>
	</div>

	<div class="flex items-center gap-3">
		<button
			class="btn btn-secondary"
			onclick={onToggleDarkMode}
			aria-label="Toggle dark mode"
			style="padding: 0.5rem"
		>
			{#if darkMode}
				<Sun size={18} />
			{:else}
				<Moon size={18} />
			{/if}
		</button>

		{#if user}
			<div class="flex items-center gap-2">
				{#if user.image}
					<img
						src={user.image}
						alt={user.name || user.email}
						class="rounded-full"
						style="width: 32px; height: 32px"
					/>
				{/if}
				<span class="text-sm text-secondary">{user.name || user.email}</span>
				<a href="/auth/signout" class="btn btn-secondary" style="padding: 0.5rem">
					<LogOut size={18} />
				</a>
			</div>
		{/if}
	</div>
</header>
