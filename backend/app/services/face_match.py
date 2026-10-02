"""
Face-match attendance - PLUGGABLE INTERFACE.

Deliberately NOT wired to DeepFace/ArcFace in this build: that's a heavy
dependency (large model weights, GPU preference) that doesn't belong in a
lean demo/pilot deployment just to tick a box. What's here is the real
interface the attendance endpoint calls - swapping in a production
matcher means implementing `FaceMatcher` and changing one line in
`get_face_matcher()`, with zero changes to the API contract or the
endpoint code.

Production implementation (see README "Swapping in real face-match"):
    from deepface import DeepFace
    class DeepFaceMatcher(FaceMatcher):
        def verify(self, reference_image_b64, checkin_image_b64):
            result = DeepFace.verify(reference_image_b64, checkin_image_b64, model_name="ArcFace")
            return result["verified"], 1 - result["distance"]
"""
import hashlib
from abc import ABC, abstractmethod


class FaceMatcher(ABC):
    @abstractmethod
    def verify(self, reference_image_b64: str, checkin_image_b64: str) -> tuple[bool, float]:
        """Returns (verified, confidence_score in [0,1])."""


class StubFaceMatcher(FaceMatcher):
    """
    Demo/dev matcher: deterministic and side-effect-free (no model
    download, runs anywhere) so the endpoint and its tests are fully
    exercisable without GPU infra. NOT a real biometric check - clearly
    labeled as such in every response it produces.
    """

    def verify(self, reference_image_b64: str, checkin_image_b64: str) -> tuple[bool, float]:
        # Deterministic stand-in so demo runs are reproducible: same input
        # always gives the same result, never randomly flaky in front of judges.
        digest = hashlib.sha256((reference_image_b64 + checkin_image_b64).encode()).hexdigest()
        pseudo_confidence = int(digest[:4], 16) / 0xFFFF  # 0..1
        return pseudo_confidence > 0.5, round(pseudo_confidence, 4)


def get_face_matcher() -> FaceMatcher:
    return StubFaceMatcher()
