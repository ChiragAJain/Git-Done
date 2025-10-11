from flask import Flask, request, jsonify, render_template, redirect, url_for, session, make_response
import requests
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
import hashlib
import hmac
import secrets
from dotenv import load_dotenv
from sqlalchemy import text
from flask import Response


load_dotenv()

application = Flask(__name__)

application.config['GITHUB_CLIENT_ID'] = os.environ.get('GITHUB_CLIENT_ID')
application.config['GITHUB_CLIENT_SECRET'] = os.environ.get('GITHUB_CLIENT_SECRET')
application.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
application.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
application.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')

if not application.config['SECRET_KEY']:
    application.config['SECRET_KEY'] = secrets.token_hex(32)
application.config['SESSION_PERMANENT'] = True
application.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
application.config['SESSION_COOKIE_HTTPONLY'] = True
application.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
application.config['SESSION_COOKIE_NAME'] = 'gitdone_session'
application.config['SESSION_COOKIE_SECURE'] = os.environ.get('BASE_URL', '').startswith('https')

db = SQLAlchemy(application)

class User(db.Model):
    id = db.Column(db.Integer,primary_key = True)
    github_id = db.Column(db.String(100), unique=True, nullable = False)
    username = db.Column(db.String(180), nullable = False)
    access_token = db.Column(db.String(200), nullable = False)
    created_at = db.Column(db.DateTime, default = datetime.utcnow, onupdate = datetime.utcnow)
    updated_at = db.Column(db.DateTime, default = datetime.utcnow, onupdate = datetime.utcnow)

class Goal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_github_id = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    deadline = db.Column(db.DateTime, nullable=False)
    repo_url = db.Column(db.String(500), nullable=False)
    completion_condition = db.Column(db.String(200), nullable=False)
    completion_type = db.Column(db.String(20), default='commit', nullable=False)  # 'commit' or 'issue'
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    embed_token = db.Column(db.String(200), unique = True, nullable = True)
    repo_owner = db.Column(db.String(100), nullable = True)
    repo_name = db.Column(db.String(100), nullable = True)
    webhook_id = db.Column(db.String(100), nullable = True)
    
    def to_dict(self):
        base_url = os.environ.get('BASE_URL', 'http://localhost:5000')
        return {
            'id': self.id,
            'user_github_id': self.user_github_id,
            'description': self.description,
            'deadline': self.deadline.isoformat(),
            'repo_url': self.repo_url,
            'completion_condition': self.completion_condition,
            'completion_type': self.completion_type,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'embed_token': self.embed_token,
            'embed_url': f'{base_url}/embed/{self.embed_token}' if self.embed_token else None
        }

def create_github_webhook(access_token, owner, repo, webhook_url, secret):
    api_url = f'https://api.github.com/repos/{owner}/{repo}/hooks'
    headers ={
        'Authorization':f'token {access_token}',
        'Accept':'application/vnd.github.v3+json'
    }
    payload = {
        'name':'web',
        'config':{
            'url':webhook_url,
            'content_type':'json',
            'secret':secret
        },
        'events':['push', 'issues']
    }
    response = requests.post(api_url,json = payload,headers = headers)
    if response.status_code == 201:
        return response.json()
    else:
        return None

def delete_github_webhook(access_token, owner, repo, webhook_id):
    """Delete a GitHub webhook for a repo"""
    api_url = f'https://api.github.com/repos/{owner}/{repo}/hooks/{webhook_id}'
    headers = {
        'Authorization': f'token {access_token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    response = requests.delete(api_url, headers=headers)
    # 204 No Content on success; 404 if missing (treat as already deleted)
    if response.status_code in (204, 404):
        return True
    print("Failed to delete webhook:", response.status_code, response.text)
    return False
    
@application.route('/')
def index():
    response = make_response(render_template('index.html', username=session.get('username')))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@application.route('/logout')
def logout():
    session.clear()
    session.modified = True
    response = make_response(redirect(url_for('index')))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response





@application.route('/service-worker.js')
def service_worker():
    response = make_response(application.send_static_file('service-worker.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@application.route('/api/github-webhook', methods=['POST'])
def github_webhook():
    signature_header = request.headers.get('X-Hub-Signature-256')
    if not signature_header:
        return jsonify({'error': 'Request is missing signature header'}), 403
    hash_object = hmac.new(
        application.config['SECRET_KEY'].encode('utf-8'),
        msg=request.data,
        digestmod=hashlib.sha256
    )
    expected_signature = "sha256=" + hash_object.hexdigest()

    if not hmac.compare_digest(expected_signature, signature_header):
        return jsonify({'error': 'Invalid signature. Request rejected.'}), 403

    payload = request.get_json()
    event_type = request.headers.get('X-GitHub-Event')
    
    if event_type == 'push':
        repo_full_name = payload.get('repository', {}).get('full_name')
        if not repo_full_name:
            return jsonify({'status': 'Payload missing repository name'}), 400
        
        repo_owner, repo_name = repo_full_name.split('/')
        goal = Goal.query.filter_by(
            repo_owner=repo_owner, 
            repo_name=repo_name, 
            status='active',
            completion_type='commit'
        ).first()

        if not goal:
            return jsonify({'status': 'No active goal for this repository with commit completion type'}), 200

        for commit in payload.get('commits', []):
            commit_message = commit.get('message', '')
            if goal.completion_condition in commit_message:
                goal.status = 'completed'
                goal.completed_at = datetime.utcnow()
                db.session.commit()
                break
    
    elif event_type == 'issues':
        action = payload.get('action')
        if action == 'closed':
            repo_full_name = payload.get('repository', {}).get('full_name')
            issue_number = payload.get('issue', {}).get('number')
            
            if not repo_full_name or not issue_number:
                return jsonify({'status': 'Payload missing repository or issue information'}), 400
            
            repo_owner, repo_name = repo_full_name.split('/')
            goal = Goal.query.filter_by(
                repo_owner=repo_owner,
                repo_name=repo_name,
                status='active',
                completion_type='issue'
            ).first()
            
            if not goal:
                return jsonify({'status': 'No active goal for this repository with issue completion type'}), 200
            
            if str(issue_number) == goal.completion_condition or f"#{issue_number}" == goal.completion_condition:
                goal.status = 'completed'
                goal.completed_at = datetime.utcnow()
                db.session.commit()

    return jsonify({'status': 'received'}), 200

@application.route('/auth/github')
def github_auth():
    client_id = application.config['GITHUB_CLIENT_ID']
    
    if not client_id:
        return "Error: GitHub OAuth not configured. Missing GITHUB_CLIENT_ID environment variable.", 500
    
    base_url = os.environ.get('BASE_URL')
    if base_url:
        redirect_uri = f'{base_url}/auth/callback'
    else:
        redirect_uri = url_for('github_callback', _external=True)
    
    scope = 'repo'
    return redirect(f'https://github.com/login/oauth/authorize?client_id={client_id}&redirect_uri={redirect_uri}&scope={scope}')

@application.route('/auth/callback')
def github_callback():
    error = request.args.get('error')
    if error:
        error_description = request.args.get('error_description', 'Unknown error')
        return f"OAuth Error: {error} - {error_description}", 400
    
    code = request.args.get('code')
    if not code:
        return "Error: No authorization code provided", 400
    
    client_id = application.config['GITHUB_CLIENT_ID']
    client_secret = application.config['GITHUB_CLIENT_SECRET']
    
    if not client_id or not client_secret:
        return "Error: GitHub OAuth not configured properly", 500
    
    token_url = 'https://github.com/login/oauth/access_token'
    payload = {
        'client_id': client_id,
        'client_secret': client_secret,
        'code': code
    }
    headers = {'Accept': 'application/json'}
    
    try:
        token_response = requests.post(token_url, json=payload, headers=headers)
        token_response.raise_for_status()
        token_data = token_response.json()
        
        if 'error' in token_data:
            return f"GitHub OAuth Error: {token_data.get('error_description', token_data['error'])}", 400
        
        access_token = token_data.get('access_token')
        if not access_token:
            return "Error: No access token received from GitHub", 400
            
    except requests.RequestException as e:
        return f"Error communicating with GitHub: {str(e)}", 500
    
    user_url = 'https://api.github.com/user'
    headers = {'Authorization': f'token {access_token}'}
    
    try:
        user_response = requests.get(user_url, headers=headers)
        user_response.raise_for_status()
        user_data = user_response.json()
        
        if 'id' not in user_data or 'login' not in user_data:
            return "Error: Invalid user data received from GitHub", 400
            
    except requests.RequestException as e:
        return f"Error fetching user data from GitHub: {str(e)}", 500
    
    try:
        user = User.query.filter_by(github_id=str(user_data['id'])).first()
        if not user:
            user = User(
                github_id=str(user_data['id']),
                username=user_data['login'],
                access_token=access_token
            )
            db.session.add(user)
        else:
            user.access_token = access_token
            user.username = user_data['login']
        
        db.session.commit()
        
        session.clear()
        session['user_github_id'] = user.github_id
        session['username'] = user.username
        session.permanent = True
        session.modified = True
        
        return redirect(url_for('index'))
        
    except Exception as e:
        db.session.rollback()
        return f"Database error: {str(e)}", 500

@application.route('/api/goals', methods=['GET'])
def get_goals():
    if 'user_github_id' not in session:
        return jsonify({'error':'Not authenticated'}),401
    user_id = session['user_github_id']
    #goals = Goal.query.filter_by(user_github_id = user_id).order_by(Goal.created_at.desc()).all()
    goals = Goal.query.filter_by(user_github_id = user_id).order_by(Goal.deadline.asc()).all()
    return jsonify([goal.to_dict() for goal in goals])

@application.route('/api/goals', methods=['POST'])
def create_goal():
    if 'user_github_id' not in session:
        return jsonify({'error':'Not authenticated'}),401
    try:
        data = request.get_json()
    except Exception as e:
        return jsonify({'error': f'Invalid JSON data: {str(e)}'}), 400
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if not all(k in data for k in ('description','deadline','repo_url','completion_condition')):
        return jsonify({'error':'Missing required fields'}),400
    user_id = session['user_github_id']
    user = User.query.filter_by(github_id = user_id).first()
    if not user:
        return jsonify({'error':'User not found'}),404
    try:
        repo_url = data.get('repo_url')
        repo_owner,repo_name = repo_url.rstrip('/').split('/')[-2:]
        if '.git' in repo_name:
            repo_name = repo_name.replace('.git','')
    except (ValueError, IndexError):
        return jsonify({'error':'Invalid repository URL. Use format: https://github.com/owner/repo'}),400
    embed_token = secrets.token_urlsafe(16)
    completion_type = data.get('completion_type', 'commit')
    if completion_type not in ['commit', 'issue']:
        return jsonify({'error':'Invalid completion_type. Must be "commit" or "issue"'}),400
    
    try:
        goal = Goal(
            user_github_id=user_id,
            description=data.get('description'),
            deadline=datetime.fromisoformat(data.get('deadline').replace('Z', '')),
            repo_url=data.get('repo_url'),
            completion_condition=data.get('completion_condition'),
            completion_type=completion_type,
            repo_owner=repo_owner,
            repo_name=repo_name,
            embed_token=embed_token
        )
        db.session.add(goal)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    
    base_url = os.environ.get('BASE_URL')
    if not base_url:
        return jsonify(goal.to_dict()), 201
    try:
        webhook_url = f'{base_url}/api/github-webhook'
        webhook_secret = application.config['SECRET_KEY']
        webhook_data = create_github_webhook(
            user.access_token,repo_owner, repo_name, webhook_url, webhook_secret
        )
        if webhook_data:
            goal.webhook_id = str(webhook_data.get('id'))
            db.session.commit()
    except Exception as e:
        print(f"Warning: Failed to create webhook: {str(e)}")
    
    return jsonify(goal.to_dict()), 201

@application.route('/api/goals/<int:goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    """Delete a goal for the current user; remove GitHub webhook if present"""
    if 'user_github_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    user_github_id = session['user_github_id']

    goal = Goal.query.filter_by(id=goal_id, user_github_id=user_github_id).first()
    if not goal:
        return jsonify({'error': 'Goal not found'}), 404

    # Attempt to delete GitHub webhook if we have the information
    if goal.webhook_id and goal.repo_owner and goal.repo_name:
        user = User.query.filter_by(github_id=user_github_id).first()
        if user and user.access_token:
            try:
                delete_github_webhook(user.access_token, goal.repo_owner, goal.repo_name, goal.webhook_id)
            except Exception as e:
                # Log and continue; we still delete the local goal to avoid dangling state
                print(f"Error deleting GitHub webhook {goal.webhook_id} for {goal.repo_owner}/{goal.repo_name}: {e}")

    # Delete the goal from the database
    db.session.delete(goal)
    db.session.commit()

    return jsonify({'status': 'deleted'}), 200

@application.route('/embed/<token>')
def embed_widget(token):
    goal = Goal.query.filter_by(embed_token=token).first()
    if not goal:
        return "Widget not found", 404
    response = make_response(render_template('embed.html', goal=goal))
    response.headers['X-Frame-Options'] = 'ALLOWALL'
    return response

@application.route('/api/embed/<token>/data')
def embed_data(token):
    goal = Goal.query.filter_by(embed_token=token).first()
    if not goal:
        return jsonify({'error': 'Goal not found'}), 404
    
    now_utc = datetime.utcnow()
    
    if goal.status == 'completed':
        time_remaining = 0
        is_overdue = False
    else:
        time_left = goal.deadline - now_utc
        time_remaining = max(0, int(time_left.total_seconds()))
        is_overdue = time_left.total_seconds() <= 0
    
    response_data = {
        'description': goal.description,
        'deadline': goal.deadline.isoformat() + 'Z',  # UTC with Z suffix
        'status': goal.status,
        'time_remaining': time_remaining,
        'is_overdue': is_overdue,
        'completion_condition': goal.completion_condition,
        'completed_at': goal.completed_at.isoformat() + 'Z' if goal.completed_at else None,
        'last_updated': now_utc.isoformat() + 'Z',  # UTC with Z suffix
        'goal_id': goal.id,
        'server_time_utc': now_utc.isoformat() + 'Z'
    }
    
    response = jsonify(response_data)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control, Pragma'
    response.headers['Access-Control-Max-Age'] = '3600'
    
    if goal.status == 'completed':
        response.headers['Cache-Control'] = 'public, max-age=3600, s-maxage=3600'
    else:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    
    import hashlib
    etag_data = f"{goal.id}-{goal.status}-{time_remaining}-{goal.completed_at}"
    etag = hashlib.md5(etag_data.encode()).hexdigest()
    response.headers['ETag'] = f'"{etag}"'
    
    return response

@application.route('/api/embed/<token>/data', methods=['OPTIONS'])
def embed_data_options(token):
    response = make_response()
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control, Pragma'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

@application.route('/api/health')
def health_check():
    health_status = {
        'service': 'git-done-api',
        'timestamp': datetime.utcnow().isoformat(),
        'status': 'healthy',
        'checks': {}
    }
    # Check database connection
    try:
        db.session.execute('SELECT 1')
        health_status['checks']['database'] = 'healthy'
    except Exception as e:
        health_status['checks']['database'] = f'unhealthy: {str(e)}'
        health_status['status'] = 'degraded'

    # Check GitHub API availability
    try:
        github_response = requests.get('https://api.github.com/zen', timeout=2)
        if github_response.status_code == 200:
            health_status['checks']['github_api'] = 'healthy'
        else:
            health_status['checks']['github_api'] = f'degraded: status {github_response.status_code}'
            health_status['status'] = 'degraded'
    except Exception as e:
        health_status['checks']['github_api'] = f'unhealthy: {str(e)}'
        health_status['status'] = 'degraded'
    
    # Return appropriate status code
    status_code = 200 if health_status['status'] == 'healthy' else 503
    return jsonify(health_status), status_code

# New route to download goal as .ics file
@application.route('/api/goals/<int:goal_id>/calendar')
def download_goal_ics(goal_id):
    if 'user_github_id' not in session:
        return jsonify({'error':'Not authenticated'}), 401

    goal = Goal.query.get(goal_id)
    if not goal or goal.user_github_id != session['user_github_id']:
        return jsonify({'error':'Goal not found'}), 404

    ics_content = f"""BEGIN:VCALENDAR
                      VERSION:2.0
                      PRODID:-//Git-Done//Deadline Event//EN
                      BEGIN:VEVENT
                      UID:{goal.id}@git-done.app
                      DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}
                      DTSTART:{goal.deadline.strftime('%Y%m%dT%H%M%SZ')}
                      SUMMARY:{goal.description}
                      DESCRIPTION:GitHub Repo: {goal.repo_url} | Completion Tag: {goal.completion_condition}
                      END:VEVENT
                      END:VCALENDAR
                    """

    response = Response(ics_content, mimetype='text/calendar')
    response.headers['Content-Disposition'] = f'attachment; filename=goal_{goal.id}.ics'
    return response


if __name__ == '__main__':
    with application.app_context():
        db.create_all()
    application.run(debug=False)
