# RentalHouse Workspace

This folder is monitored by the Rise & Shine AI ingestion system.

Folder purposes:

inbox/
Drop new files here to be processed by the AI ingestion pipeline.

processed/
Files that have already been processed and summarized by the system.

exports/
Optional exports such as emails, PDFs, or reports.

notes/
Manual notes related to this category.

Workflow:

1. Upload documents into the inbox folder.
2. The AI ingestion pipeline (n8n) will detect the new file.
3. The document will be summarized.
4. Insights and proposed tasks will appear in Rise & Shine.
5. After processing, the file is moved to processed/.

