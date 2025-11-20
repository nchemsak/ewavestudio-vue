<template>
	<div class="container">
		<div class="row">
			<div class="col-12">
				<!-- Top toolbar -->
				<header class="app-toolbar">
					<div class="app-toolbar-left">
						<ThemeToggle />
					</div>
 
					<!-- MIDI selector will be teleported into here -->
					<div id="midi-toolbar-slot" class="app-toolbar-right"></div>
				</header>
			</div>

			<div class="col-12">
				<DrumSequencer />
			</div>
		</div>
	</div>
</template>

<script setup>
import DrumSequencer from './components/DrumSequencer.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import { useTheme } from './composables/useTheme';
useTheme();
</script>

<style scoped>
.app-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
}

.app-toolbar-left {
	display: flex;
	align-items: center;
}

.app-toolbar-right {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
}
</style>
