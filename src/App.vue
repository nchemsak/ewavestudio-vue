<template>
	<div class="container app-frame">
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
	<!-- In the installed app the main site opens in the browser, not in the app's window -->
	<a href="/" class="return" :target="pwa.state.standalone ? '_blank' : undefined"
		:rel="pwa.state.standalone ? 'noopener' : undefined">Return to Ephemeral Wave</a>
	<PwaNotice />
</template>

<script setup>
import DrumSequencer from './components/DrumSequencer.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import PwaNotice from './components/PwaNotice.vue';
import { useTheme } from './composables/useTheme';
import { usePwa } from './composables/usePwa';
useTheme();
// Installing the app and using it offline: registers the service worker (builds only)
const pwa = usePwa();
</script>

<style scoped>
/* The frame fills the window, less a margin, up to 1320 px wide (Bootstrap's container steps
   between 540, 720, 960, 1140 and 1320 px, which left wide empty sides at in-between widths) */
.container.app-frame {
	max-width: 1320px;
	padding-left: 16px;
	padding-right: 16px;
}

@media (max-width: 575.98px) {
	.container.app-frame {
		padding-left: 12px;
		padding-right: 12px;
	}
}

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

.return {
	position: absolute;
	top: 50%;
	left: 10px;
}

@media (max-width: 1800px) {
	.return {
        position: relative;
        text-align: center;
        display: block;
        left: 0px;
        margin-top: 10px;
        top: auto;
        margin-bottom: 25px;
        padding: 5px;
	}
}

@media (max-width: 768px) {
	.app-toolbar {
		display: none;
	}

}
</style>
