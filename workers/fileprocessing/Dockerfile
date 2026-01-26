FROM python:3.11-slim

WORKDIR /app

RUN pip install --upgrade pip

COPY workers/fileprocessing/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/fileprocessing/ .

CMD ["python", "main.py"]
