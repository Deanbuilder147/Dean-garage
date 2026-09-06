import sys, json, urllib.request, urllib.error

BASE = 'http://localhost:3006'
def req(method, path, token=None, data=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'Bearer '+token
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE+path, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

token = sys.argv[1]
# 1) parse-excel already done? we re-parse here using uploaded file is complex; instead read payload from stdin
payload = json.load(sys.stdin)
# payload = { _importPayload, normalized, legacy } from parse-excel
status, body = req('POST', '/api/units/create-from-json', token, payload)
print('IMPORT status:', status)
print('IMPORT body:', json.dumps(body, ensure_ascii=False)[:400])
uid = body.get('unit',{}).get('id') if isinstance(body, dict) else None
if uid:
    s2, u = req('GET', f'/api/units/{uid}', token)
    print('GET unit status:', s2)
    if isinstance(u, dict):
        print('total_points:', u.get('total_points'))
        skills = u.get('skills')
        if isinstance(skills, str): skills = json.loads(skills)
        print('skills#:', len(skills) if skills else 0)
        if skills:
            print('skill0:', json.dumps(skills[0], ensure_ascii=False))
