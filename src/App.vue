<template>
	<div class="container">
		<div class="row">
			<div class="col-6">
				<div class="app-wrapper">
					<ComputerKeyboard />
				</div>
			</div>
			<div class="col-6">
				<div class="app-wrapper">
					<DrumSequencer />
				</div>
			</div>
		</div>
	</div>

</template>

<script setup>
import DrumSequencer from './components/DrumSequencer.vue';
import ComputerKeyboard from './components/ComputerKeyboard.vue'
</script>


<style>
/* Global styles if needed */
</style>
<!-- Speaker img -->
<!-- <div class="studio-wrap">
			<img src="/images/left_speaker.png" class="speaker speakerLeft">

			<img src="/images/right_speaker.png" class="speaker speakerRight">
		</div> -->