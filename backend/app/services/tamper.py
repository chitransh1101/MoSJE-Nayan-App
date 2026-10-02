"""
Video tamper/loop detection.

Why perceptual hashing and not a CNN: a looped/frozen CCTV feed produces
frames that are near-identical to each other, frame over frame, in a way
live footage never is (even a static scene has sensor noise, lighting
flicker, compression artifact drift). A perceptual hash distance between
consecutive frames captures exactly that, in a few lines, fully
explainable to a judge - a deep model would be solving a much easier
problem with a much bigger hammer.
"""
import imagehash
from PIL import Image


def frame_hash(image: Image.Image) -> imagehash.ImageHash:
    return imagehash.phash(image)


def is_looped(hashes: list[imagehash.ImageHash], threshold: int = 2, min_run: int = 5) -> bool:
    """
    Flags a feed as looped/frozen if `min_run` or more CONSECUTIVE
    frame-to-frame hash distances all fall at or below `threshold` -
    live footage's natural variation almost never stays this flat for
    this many frames in a row.
    """
    if len(hashes) < min_run + 1:
        return False

    consecutive_flat = 0
    for i in range(len(hashes) - 1):
        distance = hashes[i] - hashes[i + 1]
        if distance <= threshold:
            consecutive_flat += 1
            if consecutive_flat >= min_run:
                return True
        else:
            consecutive_flat = 0
    return False
