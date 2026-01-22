FROM python:3.11-slim

WORKDIR /app

RUN pip install --upgrade pip

# Assuming build context is the 'workers' directory
COPY fileprocessing /app/fileprocessing
COPY cassette-processing /app/cassette-processing

# Install dependencies
RUN pip install --no-cache-dir -r cassette-processing/requirements.txt

WORKDIR /app/cassette-processing

CMD ["python", "main.py"]