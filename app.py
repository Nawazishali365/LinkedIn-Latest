from flask import Flask, render_template, request, redirect, url_for, jsonify, session
import csv
import os
from collections import defaultdict
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "Ykn8@ye9XD"  # Secret key for sessions

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'csv'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET', 'POST'])
def index():
    error = None
    if request.method == 'POST':
        file = request.files.get('file')
        if file and allowed_file(file.filename):
            try:
                filename = secure_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                
                session['filename'] = filename  # Store filename per user session

                return redirect(url_for('graph'))
            except Exception as e:
                error = f"Error processing file: {str(e)}"
        else:
            error = "Please upload a valid CSV file."
    return render_template('index.html', error=error)

@app.route('/graph')
def graph():
    return render_template('graph.html')

@app.route('/data')
def get_data():
    filename = session.get('filename')
    if not filename:
        return jsonify({"error": "No file uploaded."}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    try:
        data = parse_csv(filepath)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def parse_csv(filepath):
    nodes = []
    links = []
    seen_nodes = set()
    company_nodes = defaultdict(list)
    company_counts = defaultdict(int)

    with open(filepath, newline='', encoding='utf-8') as csvfile:
        lines = csvfile.readlines()

        # Step 1: Find header row dynamically
        header_index = None
        for i, line in enumerate(lines):
            lower_line = line.strip().lower()
            if all(field in lower_line for field in ['first name', 'last name', 'email address', 'company']):
                header_index = i
                break

        if header_index is None:
            raise ValueError("CSV header with required columns not found.")

        valid_lines = lines[header_index:]
        reader = csv.DictReader(valid_lines)

        for row in reader:
            try:
                if not row:
                    continue

                row = {k.strip().lower(): v.strip() for k, v in row.items() if k}

                first = row.get('first name', '')
                last = row.get('last name', '')
                email = row.get('email address', '')
                company = row.get('company', '')
                position = row.get('position', '')
                person = f"{first} {last}".strip()

                if not first or not company:
                    continue

                node = {
                    "id": person,
                    "group": company,
                    "position": position,
                    "email": email
                }

                company_nodes[company].append(node)
                company_counts[company] += 1

                links.append({
                    "source": "You",
                    "target": person
                })
            except Exception as e:
                print(f"Skipping row due to error: {e}")
                continue

    # Add "You" node once
    nodes.append({"id": "You", "group": "You", "position": "Self"})
    seen_nodes.add("You")

    # Limit each company to 100 nodes
    for company, members in company_nodes.items():
        limited = members[:101]
        for member in limited:
            if member['id'] not in seen_nodes:
                nodes.append(member)
                seen_nodes.add(member['id'])

    # Only keep links that refer to existing nodes
    visible_ids = set(node['id'] for node in nodes)
    filtered_links = [link for link in links if link['target'] in visible_ids]

    return {
        "nodes": nodes,
        "links": filtered_links,
        "companyCounts": dict(company_counts)
    }

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
