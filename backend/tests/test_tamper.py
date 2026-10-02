from PIL import Image

from app.services.tamper import frame_hash, is_looped


def _solid_color_image(color: tuple[int, int, int], size=(64, 64)) -> Image.Image:
    return Image.new("RGB", size, color)


def _structured_image(seed: int, size=(64, 64)) -> Image.Image:
    """
    A flat solid-color fill has zero internal structure, so perceptual
    hashing (which is built on DCT of luminance, not raw color) genuinely
    can't tell two solid colors apart - that's an accurate property of
    pHash, not a bug in is_looped(). Real video frames always carry
    texture/edges, so a meaningful "are these visually different" test
    needs images with actual structure: here, a distinct random noise
    field per seed.
    """
    return Image.effect_noise(size, 60).convert("RGB").rotate(seed * 37)


def _noisy_variant(base_color: tuple[int, int, int], seed: int) -> Image.Image:
    """Simulates natural frame-to-frame variation a live feed has (not a perfect repeat)."""
    import random

    rng = random.Random(seed)
    img = Image.new("RGB", (64, 64))
    pixels = img.load()
    for x in range(64):
        for y in range(64):
            jitter = rng.randint(-15, 15)
            pixels[x, y] = tuple(max(0, min(255, c + jitter)) for c in base_color)
    return img


def test_identical_frames_are_flagged_as_looped():
    frame = _solid_color_image((100, 150, 200))
    hashes = [frame_hash(frame) for _ in range(8)]  # same exact frame, 8 times = frozen feed
    assert is_looped(hashes, min_run=5) is True


def test_visually_distinct_frames_are_not_flagged():
    hashes = [frame_hash(_structured_image(seed=i)) for i in range(6)]
    assert is_looped(hashes, min_run=5) is False


def test_flat_solid_colors_are_a_known_phash_blind_spot():
    """
    Documents a real, useful property (not a bug): pHash is built on
    luminance structure, so distinct FLAT colors with no internal texture
    can legitimately hash as near-identical. This is why is_looped() is
    used as one signal among several (alongside CCTV cross-check and
    attendance patterns) rather than the sole tamper indicator.
    """
    hashes = [
        frame_hash(_solid_color_image((10, 10, 10))),
        frame_hash(_solid_color_image((250, 10, 10))),
        frame_hash(_solid_color_image((10, 250, 10))),
        frame_hash(_solid_color_image((10, 10, 250))),
        frame_hash(_solid_color_image((250, 250, 10))),
        frame_hash(_solid_color_image((10, 250, 250))),
    ]
    assert is_looped(hashes, min_run=5) is True


def test_naturally_varying_frames_are_not_flagged():
    """Live footage has natural per-frame noise - this must NOT be mistaken for a freeze."""
    hashes = [frame_hash(_noisy_variant((120, 130, 140), seed=i)) for i in range(10)]
    assert is_looped(hashes, threshold=2, min_run=5) is False


def test_short_sequence_never_flagged():
    """Fewer frames than min_run can't possibly prove a loop - must default to False, not error."""
    frame = _solid_color_image((50, 50, 50))
    hashes = [frame_hash(frame) for _ in range(3)]
    assert is_looped(hashes, min_run=5) is False
