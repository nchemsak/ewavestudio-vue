// Ping-pong delay: the delay pedal's PING PONG switch, in the live and export engines.
// The sound (summed to mono) goes into the left delay; its echo plays on the left, then
// crosses to the right delay, whose echo plays on the right a delay later, and back to the
// left: echoes alternate left, right, left... Each crossing is one pass of the feedback (its
// gain and tone filter), so echo n is as loud and as dark as the plain delay's echo n, and the
// wet tone filters colour every echo once, as in the plain delay.
//
//   input ─► L ─► wetL ─► merger 0 (left)    L ─► fbL ─► gainLR ─► R
//            R ─► wetR ─► merger 1 (right)   R ─► fbR ─► gainRL ─► L

export type PingPong = {
	input: GainNode;          // mono; its gain is the send (0 = off)
	output: ChannelMergerNode; // stereo echoes, into the delay's wet gain
	delays: DelayNode[];
	feedback: GainNode[];
	tones: BiquadFilterNode[]; // every tone filter (feedback and wet), set like the plain delay's
};

export function createPingPong(ctx: BaseAudioContext, maxDelay = 5): PingPong {
	const input = ctx.createGain();
	input.channelCount = 1;
	input.channelCountMode = 'explicit';
	input.channelInterpretation = 'speakers';

	const left = ctx.createDelay(maxDelay);
	const right = ctx.createDelay(maxDelay);
	const fbL = ctx.createBiquadFilter();
	const fbR = ctx.createBiquadFilter();
	const wetL = ctx.createBiquadFilter();
	const wetR = ctx.createBiquadFilter();
	const gainLR = ctx.createGain();
	const gainRL = ctx.createGain();
	const output = ctx.createChannelMerger(2);

	input.connect(left);
	left.connect(fbL).connect(gainLR).connect(right);
	right.connect(fbR).connect(gainRL).connect(left);
	left.connect(wetL).connect(output, 0, 0);
	right.connect(wetR).connect(output, 0, 1);

	return { input, output, delays: [left, right], feedback: [gainLR, gainRL], tones: [fbL, fbR, wetL, wetR] };
}
