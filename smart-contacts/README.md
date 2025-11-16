# Smart Contacts (Web)

Load a JSON file of contacts and filter in real time by name, company, tags, email, or phone.

## Format
Array of contact objects:
```json
[
  {
    "name": "Jane Doe",
    "company": "SunBright Energy",
    "email": "jane@sunbright.com",
    "phone": "555-123-4567",
    "title": "Project Manager",
    "tags": ["solar", "renewables", "EPC"]
  }
]
```

## TODO
- Persist recent files in IndexedDB.
- Integrate CRM/Acumatica API.
- Role-based access control.


