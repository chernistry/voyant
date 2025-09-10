Based on the following travel preferences, recommend 3-4 destinations.
Preferences: {preferences}
User query context: {slots}

For each destination, provide a brief, compelling reason why it matches the
preferences. Return the recommendations in a JSON array with the following
structure:
[
  {
    "city": "City Name",
    "country": "Country Name",
    "description": "Why this destination is a good fit.",
    "tags": {
      "climate": "e.g., warm, cold, temperate",
      "budget": "e.g., low, mid, high",
      "family_friendly": true/false
    }
  }
]
