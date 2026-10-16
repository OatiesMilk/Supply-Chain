import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachmentMimeType,
  attachmentQuotaError,
  isPdfDocument,
  isWordDocument,
  MAX_ATTACHMENTS_PER_RECORD,
  MAX_RECORD_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BYTES,
  UNSUPPORTED_FILE_TYPE,
} from '../../../server/src/services/attachmentRules';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 1 (UNIT TESTS)
 * Domain Module: Attachment Validation, Magic Bytes & Storage Quotas
 * QA Reference: TC-ATT-001, TC-ATT-003, TC-ATT-004, TC-ATT-007
 * ============================================================================
 */

describe('Layer 1 (Unit): Attachment Validation & Storage Quotas', () => {
  describe('File Extension & MIME Type Resolution', () => {
    test('test_accepts_supported_document_and_image_extensions', () => {
      assert.equal(attachmentMimeType('contract.pdf'), 'application/pdf');
      assert.equal(attachmentMimeType('delivery-receipt.PDF'), 'application/pdf', 'Should be case-insensitive');
      assert.equal(attachmentMimeType('photo.jpg'), 'image/jpeg');
      assert.equal(attachmentMimeType('photo.jpeg'), 'image/jpeg');
      assert.equal(attachmentMimeType('signature.png'), 'image/png');
      assert.equal(attachmentMimeType('manifest.doc'), 'application/msword');
      assert.equal(attachmentMimeType('specs.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    test('test_rejects_unsupported_or_executable_extensions', () => {
      assert.equal(attachmentMimeType('malicious.exe'), undefined);
      assert.equal(attachmentMimeType('script.sh'), undefined);
      assert.equal(attachmentMimeType('macro.xlsm'), undefined);
      assert.equal(attachmentMimeType('payload.js'), undefined);
      assert.equal(attachmentMimeType('index.html'), undefined);
      assert.equal(attachmentMimeType('archive.zip'), undefined);
      assert.equal(attachmentMimeType('no_extension'), undefined);
    });
  });

  describe('Storage Quota Calculations (10 files / 50MB per record)', () => {
    test('test_permits_upload_when_within_count_and_byte_limits', () => {
      const err = attachmentQuotaError(5, 20 * 1024 * 1024, 2 * 1024 * 1024);
      assert.equal(err, null, 'Upload within quotas must return null error');
    });

    test('test_rejects_upload_when_record_already_has_10_attachments', () => {
      const err = attachmentQuotaError(10, 5 * 1024 * 1024, 1024);
      assert.ok(err?.includes('already has 10 attachments'), 'Must reject 11th file');
    });

    test('test_rejects_upload_when_cumulative_bytes_exceed_50mb', () => {
      // 45 MB existing + 6 MB incoming = 51 MB > 50 MB
      const err = attachmentQuotaError(3, 45 * 1024 * 1024, 6 * 1024 * 1024);
      assert.ok(err?.includes('50 MB attachment limit'), 'Must reject upload exceeding 50 MB cumulative');
    });
  });

  describe('Magic Bytes Verification (Defense in Depth against Polyglots)', () => {
    test('test_accepts_valid_pdf_structure_with_header_and_trailer', () => {
      const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000010 00000 n \ntrailer\n<< /Size 2 >>\nstartxref\n70\n%%EOF\n';
      const buffer = Buffer.from(pdfContent, 'latin1');
      assert.equal(isPdfDocument(buffer), true);
    });

    test('test_rejects_spoofed_pdf_files_missing_header_or_eof', () => {
      const badHeader = Buffer.from('FAKE-PDF\nstartxref\n10\n%%EOF');
      assert.equal(isPdfDocument(badHeader), false, 'File without %PDF header must fail');

      const badTail = Buffer.from('%PDF-1.4\nsome content without eof marker');
      assert.equal(isPdfDocument(badTail), false, 'File without %%EOF marker must fail');

      const exeWithPdfExt = Buffer.from('MZ\x90\x00\x03\x00\x00\x00%PDF-1.4');
      assert.equal(isPdfDocument(exeWithPdfExt), false, 'EXE header must fail');
    });

    test('test_rejects_fake_word_documents_missing_ole_signature', () => {
      const plainText = Buffer.from('This is a fake Word document masquerading as .doc');
      assert.equal(isWordDocument(plainText), false);
    });
  });
});
