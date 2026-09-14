FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app

# Only the model files backend/app/ml.py actually loads (ml.py resolves
# ROOT_DIR as three parents up from itself, i.e. this WORKDIR, then reads
# from ROOT_DIR/models/).
COPY models/thermoguard_risk_v3.pkl models/label_encoder_risk_v3.pkl models/feature_columns_risk_v3.pkl \
     models/thermoguard_fire_source_v3.pkl models/fire_source_label_encoder_v3.pkl models/fire_source_features_v3.pkl \
     models/

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
