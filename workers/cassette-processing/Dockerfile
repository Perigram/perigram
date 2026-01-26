FROM python:3.11-slim

WORKDIR /app

RUN pip install --upgrade pip

# Build context should be the project root
COPY workers/fileprocessing /app/fileprocessing
COPY workers/cassette-processing /app/cassette-processing

# Install dependencies
RUN pip install --no-cache-dir -r cassette-processing/requirements.txt

WORKDIR /app/cassette-processing

CMD ["python", "main.py"]