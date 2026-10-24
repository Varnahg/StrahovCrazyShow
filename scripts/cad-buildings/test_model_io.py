"""Lehké skutečné filesystem regrese publikace, bez Blenderu a bez CAD vstupů."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import model_io


class ModelPublicationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='cad-model-io-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.staging = self.root / 'staging'
        self.transaction = self.staging / 'b01-example'
        self.transaction.mkdir(parents=True)
        self.pairs = []
        for suffix in ['blend', 'glb', 'json']:
            source = self.transaction / f'new.{suffix}'
            target = self.root / f'model.{suffix}'
            source.write_text('new-' + suffix)
            target.write_text('old-' + suffix)
            self.pairs.append((source, target))

    def assert_old(self):
        for _, target in self.pairs:
            self.assertEqual(target.read_text(), 'old-' + target.suffix[1:])

    def test_complete_set_is_published(self):
        result = model_io.publish_files(self.pairs, self.transaction, self.root)
        self.assertEqual(result['state'], 'committed')
        for _, target in self.pairs:
            self.assertEqual(target.read_text(), 'new-' + target.suffix[1:])
        model_io.recover_pending(self.staging, self.root, [target for _, target in self.pairs])
        self.assertEqual(self.pairs[0][1].read_text(), 'new-blend')

    def test_missing_input_does_not_replace_any_target(self):
        self.pairs[-1][0].unlink()
        with self.assertRaises(FileNotFoundError):
            model_io.publish_files(self.pairs, self.transaction, self.root)
        self.assert_old()

    def test_mid_publish_failure_restores_complete_old_set(self):
        replace = model_io.os.replace
        def fail_once(source, target):
            if Path(source) == self.pairs[1][0]:
                raise PermissionError('simulované obsazení cílového GLB')
            return replace(source, target)
        with patch.object(model_io.os, 'replace', side_effect=fail_once):
            with self.assertRaises(PermissionError):
                model_io.publish_files(self.pairs, self.transaction, self.root)
        self.assert_old()

    def test_new_files_are_removed_on_rollback(self):
        for _, target in self.pairs:
            target.unlink()
        replace = model_io.os.replace
        def fail_once(source, target):
            if Path(source) == self.pairs[1][0]:
                raise PermissionError('simulované selhání')
            return replace(source, target)
        with patch.object(model_io.os, 'replace', side_effect=fail_once):
            with self.assertRaises(PermissionError):
                model_io.publish_files(self.pairs, self.transaction, self.root)
        self.assertTrue(all(not target.exists() for _, target in self.pairs))

    def interrupted_publication(self):
        replace = model_io.os.replace
        def interrupt(source, target):
            if Path(source) == self.pairs[1][0]:
                raise KeyboardInterrupt('simulované ukončení procesu')
            return replace(source, target)
        with patch.object(model_io.os, 'replace', side_effect=interrupt):
            with self.assertRaises(KeyboardInterrupt):
                model_io.publish_files(self.pairs, self.transaction, self.root)

    def test_next_run_recovers_interrupted_publication(self):
        self.interrupted_publication()
        self.assertEqual(self.pairs[0][1].read_text(), 'new-blend')
        model_io.recover_pending(self.staging, self.root, [target for _, target in self.pairs])
        self.assert_old()

    def test_recovery_never_overwrites_unexpected_content(self):
        self.interrupted_publication()
        self.pairs[-1][1].write_text('independent-user-edit')
        with self.assertRaises(RuntimeError):
            model_io.recover_pending(self.staging, self.root, [target for _, target in self.pairs])
        self.assertEqual(self.pairs[-1][1].read_text(), 'independent-user-edit')
        self.assertEqual(self.pairs[0][1].read_text(), 'new-blend')

    def test_explicit_target_scope_is_required_for_recovery(self):
        self.interrupted_publication()
        with self.assertRaises(ValueError):
            model_io.recover_pending(self.staging, self.root, [self.pairs[0][1]])

    def test_output_outside_workspace_is_rejected(self):
        external = tempfile.TemporaryDirectory(prefix='cad-model-outside-')
        self.addCleanup(external.cleanup)
        outside = Path(external.name) / 'not-owned-model.glb'
        outside.write_text('outside-marker')
        with self.assertRaises(ValueError):
            model_io.publish_files([(self.pairs[0][0], outside)], self.transaction, self.root)
        self.assertEqual(outside.read_text(),'outside-marker')
        self.assert_old()


class TriangleOrientationTests(unittest.TestCase):
    def test_cyclic_permutation_keeps_identity(self):
        triangle=[(0,0,0),(2,0,0),(0,1,0)]
        expected,_=model_io.oriented_triangle(triangle)
        self.assertEqual(expected,model_io.oriented_triangle(triangle[1:]+triangle[:1])[0])

    def test_reversed_winding_is_not_the_same_export(self):
        triangle=[(0,0,0),(2,0,0),(0,1,0)]
        self.assertNotEqual(model_io.oriented_triangle(triangle)[0],model_io.oriented_triangle(list(reversed(triangle)))[0])

    def test_small_valid_triangles_are_not_quantized_away(self):
        triangle=[(0,0,0),(0.0000001,0,0),(0,1,0)]
        self.assertNotEqual(model_io.oriented_triangle(triangle)[0],model_io.oriented_triangle(list(reversed(triangle)))[0])


if __name__ == '__main__':
    unittest.main()
