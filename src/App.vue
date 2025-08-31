<template>
	<div class="container">
		<div class="row">
			<!-- <div class="col-6">
				<ComputerKeyboard />
			</div> -->
			<div class="col-12">
				<ThemeToggle />
			</div>
			<div class="col-12">
				<DrumSequencer />
			</div>

		</div>

	</div>

</template>

<script setup>
import DrumSequencer from './components/DrumSequencer.vue';
// import ComputerKeyboard from './components/ComputerKeyboard.vue'

import ThemeToggle from './components/ThemeToggle.vue';
import { useTheme } from './composables/useTheme';
useTheme();
</script>


<style scoped>
.app-toolbar {
	display: flex;
	justify-content: flex-end;
	padding: 12px 16px;
}

/* Global styles if needed */
</style>
