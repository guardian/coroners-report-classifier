#!/usr/bin/python3

import os

for root, dir, files in os.walk('data/PFD_docs'):
  for file in files:
    if (file.endswith(".pdf") and not file.startswith("ocr-")):
      path = os.path.join(root, file)
      print(f"Processing ${path}")
      ocr_path = os.path.join(root, "ocr-" + file)

      os.system(f"ocrmypdf --skip-text {path} {ocr_path}")
      os.system(f"pdftotext {ocr_path}")
