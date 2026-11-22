"""Render the game's original, two-velocity synthesized instrument samples."""
from math import exp, pi, sin, tanh
from pathlib import Path
from random import Random
import array
import wave

RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / "assets" / "studio"
VOICES = {
    "piano": (1.5, 3.0), "keys": (1.5, 2.8), "marimba": (1.0, 5.0),
    "pluck": (1.4, 3.6), "bass": (1.7, 2.6),
    "kick": (.32, 15), "tambora": (.42, 13), "hat": (.16, 38),
    "snare": (.25, 18), "wood": (.18, 30), "clap": (.27, 24), "guache": (.23, 23),
}


def render(voice, duration, decay, strong, seed):
    rng = Random(seed)
    data = array.array("h")
    previous_noise = 0
    for frame in range(int(RATE * duration)):
        t = frame / RATE
        noise = rng.uniform(-1, 1)
        high_noise = noise - .86 * previous_noise
        previous_noise = noise
        env = min(1, t / .005) * exp(-decay * t) * min(1, (duration - t) / .045)
        f = 261.6256
        phase = 2 * pi * f * t
        bright = 1.35 if strong else .66
        if voice == "piano":
            value = .7 * sin(phase) + bright * (.3 * sin(phase * 2.003)
                     + .2 * sin(phase * 3.011) + .11 * sin(phase * 4.018)) * exp(-6*t)
        elif voice == "keys":
            value = sin(phase + bright * 1.45 * exp(-8*t) * sin(phase * 2)) + .17 * sin(phase * 1.004)
        elif voice == "marimba":
            value = .9 * sin(phase) + .36 * bright * exp(-23*t) * sin(phase * 3.98)
        elif voice == "pluck":
            value = sum(sin(phase * harmonic) * exp(-harmonic * 2.4*t) / harmonic
                        for harmonic in range(1, 7)) + .12 * bright * noise * exp(-60*t)
        elif voice == "bass":
            value = .82 * sin(phase) + .22 * bright * exp(-4*t) * sin(phase*2) + .12*sin(phase*3)
        elif voice in ("kick", "tambora"):
            freq = 47 if voice == "kick" else 83
            thump = 2*pi*(freq*t + 3.6*(1-exp(-t*38)))
            value = sin(thump) + .32 * bright * noise * exp(-70*t)
            if voice == "tambora":
                value += .36 * sin(thump*1.51) * exp(-18*t)
        elif voice == "hat":
            value = .55 * high_noise + .15 * sin(t*2*pi*6643)
        elif voice == "guache":
            value = .8 * high_noise * (.43 + .57 * sin(t*2*pi*53)**2)
        elif voice == "wood":
            value = .8*sin(2*pi*1331*t) + .38*sin(2*pi*1832*t)*exp(-20*t)
        elif voice == "clap":
            bursts = sum(exp(-(t-offset)*95) for offset in (0, .011, .024) if t >= offset)
            value = noise * (.35 + bursts)
        else:
            value = .71 * high_noise + .4 * sin(t*2*pi*175) * exp(-19*t)
        data.append(round(27000 * tanh(env * value * (1 if strong else .70))))
    return data


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for index, (voice, (duration, decay)) in enumerate(VOICES.items()):
        for strong in (0, 1):
            with wave.open(str(ROOT / f"{voice}-{strong}.wav"), "wb") as output:
                output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
                output.writeframes(render(voice, duration, decay, strong, index*2 + strong).tobytes())


if __name__ == "__main__":
    main()
