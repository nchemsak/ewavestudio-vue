<template>
	<div class="container app-frame">
		<div class="row">
			<div class="col-12">
				<!-- Top toolbar -->
				<header v-show="!phoneActive" class="app-toolbar">
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
	<a v-show="!phoneActive" href="/" class="return" :target="pwa.state.standalone ? '_blank' : undefined"
		:rel="pwa.state.standalone ? 'noopener' : undefined">Return to Ephemeral Wave</a>
	<PwaNotice />
	<!-- A phone held upright: the phone layout is made for landscape (usePhoneMode.ts) -->
	<div v-if="phoneHint" class="phone-hint" role="dialog" aria-label="Turn your phone">
		<div>
			<div class="phone-hint-icon" aria-hidden="true"></div>
			<h2>Turn your phone</h2>
			<p>The synth is laid out sideways, like a piece of hardware. Turn your phone to landscape to play.</p>
			<button type="button" class="pt-btn" @click="setPhoneFull(true)">Use the full layout instead</button>
		</div>
	</div>
</template>

<script setup>
import DrumSequencer from './components/DrumSequencer.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import PwaNotice from './components/PwaNotice.vue';
import { useTheme } from './composables/useTheme';
import { usePwa } from './composables/usePwa';
import { usePhoneMode } from './composables/usePhoneMode';
import { watchEffect } from 'vue';
useTheme();
// Installing the app and using it offline: registers the service worker (builds only)
const pwa = usePwa();
// Phone mode: the phone layout covers the page, so the page itself doesn't scroll
const { active: phoneActive, hint: phoneHint, setFull: setPhoneFull } = usePhoneMode();
watchEffect(() => document.documentElement.classList.toggle('phone-mode', phoneActive.value || phoneHint.value));
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

.phone-hint {
	position: fixed;
	inset: 0;
	z-index: 70;
	display: grid;
	place-items: center;
	text-align: center;
	padding: 32px 28px;
	background: var(--pt-page);
	color: var(--pt-text);
}

.phone-hint h2 {
	font-size: 1.3rem;
	margin: 0 0 8px;
}

.phone-hint p {
	margin: 0 auto 22px;
	max-width: 26ch;
	line-height: 1.5;
}

.phone-hint .pt-btn {
	padding: 10px 14px;
}

.phone-hint-icon {
	width: 64px;
	height: 108px;
	margin: 0 auto 22px;
	border: 3px solid currentColor;
	border-radius: 14px;
	animation: phone-turn 2.4s ease-in-out infinite;
}

@keyframes phone-turn {
	0%, 30% { transform: rotate(0); }
	60%, 100% { transform: rotate(-90deg); }
}

@media (prefers-reduced-motion: reduce) {
	.phone-hint-icon {
		animation: none;
		transform: rotate(-90deg);
	}
}
</style>
