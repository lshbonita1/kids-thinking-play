# 홍보 영상 배경음악 직접 만들기 (잔잔하고 살짝 신나는 마림바 곡, 다장조, 104 BPM)
# 외부 음원을 쓰지 않으므로 저작권 걱정이 없음
import math, random, wave, struct, sys
SR = 44100
TOTAL = 31.4
BAR = 60 / 104 * 4          # 한 마디 약 2.31초
E8 = BAR / 8                # 8분음표
N = int(SR * (TOTAL + 0.2))
L = [0.0] * N
R = [0.0] * N
random.seed(7)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def add(start, dur, gain, pan, fn):
    i0 = int(start * SR)
    n = min(int(dur * SR), N - i0)
    gl, gr = gain * (1 - pan) ** 0.5, gain * (1 + pan) ** 0.5 / 1.0
    for k in range(n):
        v = fn(k / SR)
        L[i0 + k] += v * gl
        R[i0 + k] += v * gr

def marimba(m):
    f = hz(m); tw = 2 * math.pi
    def fn(t):
        a = min(1, t / 0.004)
        return a * (math.sin(tw * f * t) * math.exp(-t * 5.5) + 0.25 * math.sin(tw * f * 4 * t) * math.exp(-t * 22) + 0.08 * math.sin(tw * f * 10 * t) * math.exp(-t * 40))
    return fn

def glock(m):
    f = hz(m); tw = 2 * math.pi
    return lambda t: min(1, t / 0.002) * (math.sin(tw * f * t) + 0.3 * math.sin(tw * f * 2.76 * t) * math.exp(-t * 6)) * math.exp(-t * 2.2)

def pad(m, length):
    f = hz(m); tw = 2 * math.pi
    def fn(t):
        env = min(1, t / 0.5) * min(1, max(0, (length - t) / 0.6))
        return env * (math.sin(tw * f * t) + 0.25 * math.sin(tw * f * 2 * t + 0.5) + 0.1 * math.sin(tw * f * 3 * t))
    return fn

def bass(m):
    f = hz(m); tw = 2 * math.pi
    return lambda t: min(1, t / 0.01) * (math.sin(tw * f * t) + 0.2 * math.sin(tw * f * 2 * t)) * math.exp(-t * 3)

def shaker(t):
    return random.uniform(-1, 1) * math.exp(-t * 60) * min(1, t / 0.003)

CHORDS = {'C': (48, [60, 64, 67]), 'G': (43, [59, 62, 67]), 'Am': (45, [57, 60, 64]), 'F': (41, [57, 60, 65])}
PROG = ['C', 'G', 'Am', 'F']
MEL_A = [[(0, 72), (1, 76), (2, 79), (3, 76), (4, 74), (6, 72)],
         [(0, 74), (2, 71), (3, 74), (4, 79), (6, 74)],
         [(0, 72), (1, 76), (2, 81), (4, 79), (5, 76), (6, 72)],
         [(0, 77), (2, 76), (3, 74), (4, 72), (6, 69)]]
MEL_B = [[(0, 79), (1, 76), (2, 72), (3, 76), (4, 79), (6, 84)],
         [(0, 83), (2, 79), (4, 74), (5, 79)],
         [(0, 81), (1, 79), (2, 76), (4, 72), (6, 76)],
         [(0, 77), (2, 81), (4, 79), (5, 77), (6, 74)]]
MEL_A2 = MEL_A[:3] + [[(0, 77), (2, 76), (3, 74), (4, 71), (6, 74)]]
# 마디 0: 들어가기(화음 + 반짝이), 1~4: A, 5~8: B, 9~12: A', 13: 끝 화음
song = [('C', None)] + [(PROG[k], MEL_A[k]) for k in range(4)] + [(PROG[k], MEL_B[k]) for k in range(4)] + [(PROG[k], MEL_A2[k]) for k in range(4)]
for b, (ch, mel) in enumerate(song):
    t0 = b * BAR
    root, tones = CHORDS[ch]
    for m in tones:
        add(t0, BAR + 0.6, 0.035, 0.0, pad(m, BAR + 0.6))
    if b > 0:
        for beat in (0, 2):
            add(t0 + beat * 2 * E8, 1.2, 0.11, -0.1, bass(root))
        for k in range(8):
            if k % 2 == 1:
                add(t0 + k * E8, 0.08, 0.05, -0.5, shaker)
    if mel:
        for pos, m in mel:
            add(t0 + pos * E8, 1.0, 0.36, 0.1, marimba(m))
    # 마디 끝마다 작은 반짝이 (높은 음)
    add(t0 + 7 * E8, 1.6, 0.06, 0.6, glock(tones[-1] + 24 if b % 2 else tones[1] + 24))
# 끝: 다 화음을 길게
end = 13 * BAR
for m in (60, 64, 67, 72):
    add(end, TOTAL - end + 0.2, 0.18, 0.1, marimba(m))
    add(end, TOTAL - end + 0.2, 0.04, 0.0, pad(m, TOTAL - end + 0.2))
add(end, TOTAL - end, 0.08, 0.6, glock(84))
add(end, 1.5, 0.11, -0.1, bass(48))

peak = max(max(abs(x) for x in L), max(abs(x) for x in R))
g = 0.85 / peak
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<hh', int(L[i] * g * 32767), int(R[i] * g * 32767)) for i in range(N)))
print('bars', len(song), 'bar sec', round(BAR, 3), 'peak gain', round(g, 2))
