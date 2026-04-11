FROM python:3.11-slim

WORKDIR /app

COPY layer1-strategy-market/engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY layer1-strategy-market/engine/ .

EXPOSE 3200

CMD ["python3", "main.py"]
