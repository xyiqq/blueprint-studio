"Natural language extraction for AI queries."
from __future__ import annotations

import re

from .ai_constants import DOMAIN_SYNONYMS, DOMAIN_ACTIONS


def detect_domain(query: str) -> str:
    """Detect domain from natural language query using synonym mapping."""
    query_lower = query.lower()
    words = set(re.findall(r'\w+', query_lower))

    domain_scores = {}
    for domain, synonyms in DOMAIN_SYNONYMS.items():
        score = 0
        for synonym in synonyms:
            synonym_words = synonym.split()
            if len(synonym_words) == 1:
                if synonym in words:
                    score += 2
            else:
                if synonym in query_lower:
                    score += 3
            if score > 0:
                domain_scores[domain] = score

    if domain_scores:
        return max(domain_scores, key=domain_scores.get)
    return "light"


def extract_area(query: str) -> str | None:
    """Extract area/room name from query (kitchen, bedroom, etc.)."""
    area_keywords = ["kitchen", "bedroom", "living room", "bathroom", "garage", "office",
                     "hallway", "basement", "attic", "dining room", "laundry", "porch",
                     "garden", "backyard", "frontyard", "front yard", "upstairs", "downstairs",
                     "balcony", "patio", "deck", "entryway", "foyer", "closet", "pantry",
                     "mudroom", "study", "den", "family room", "playroom", "nursery"]

    query_lower = query.lower()
    for area in area_keywords:
        if area in query_lower:
            return area
    return None


def find_best_entities(hass, query: str, domain: str, limit: int = 1) -> list[str]:
    """Find best matching entities with improved scoring and area awareness."""
    if not hass:
        return [f"{domain}.your_device"]

    entities = []
    words = set(re.findall(r'\w+', query.lower()))
    area = extract_area(query)

    find_all = any(word in query.lower() for word in ["all", "every", "entire"])

    for state in hass.states.async_all():
        if state.domain != domain:
            continue

        score = 0
        entity_lower = state.entity_id.lower()
        friendly_name = state.attributes.get("friendly_name", "").lower()

        if area:
            if area in entity_lower:
                score += 10
            if area in friendly_name:
                score += 10

        for w in words:
            if len(w) < 3:
                continue
            entity_parts = entity_lower.split('.')[1].split('_')
            if w in entity_parts:
                score += 5
            elif w in entity_lower:
                score += 2

            friendly_words = friendly_name.split()
            if w in friendly_words:
                score += 8
            elif w in friendly_name:
                score += 3

        if score > 0:
            entities.append((state.entity_id, score))

    if not entities:
        return [f"{domain}.your_device"]

    entities.sort(key=lambda x: x[1], reverse=True)

    if find_all and len(entities) > 1:
        top_score = entities[0][1]
        threshold = top_score * 0.5
        return [e[0] for e in entities if e[1] >= threshold][:10]

    return [e[0] for e in entities[:limit]]


def extract_conditions(hass, query: str) -> list[dict]:
    """Extract conditions from natural language (if home, after dark, on weekdays, etc.)."""
    conditions = []
    query_lower = query.lower()

    if any(phrase in query_lower for phrase in ["if home", "when home", "if someone", "if anyone", "when someone", "when anyone"]):
        if hass:
            person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
            if person_entities:
                conditions.append({
                    "condition": "state",
                    "entity_id": person_entities[0],
                    "state": "home"
                })
    elif any(phrase in query_lower for phrase in ["if away", "when away", "if nobody", "if no one", "when nobody", "when no one"]):
        if hass:
            person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
            if person_entities:
                conditions.append({
                    "condition": "state",
                    "entity_id": person_entities[0],
                    "state": "not_home"
                })

    if any(phrase in query_lower for phrase in ["after dark", "at night", "when dark", "if dark", "after sunset"]):
        conditions.append({
            "condition": "state",
            "entity_id": "sun.sun",
            "state": "below_horizon"
        })
    elif any(phrase in query_lower for phrase in ["during day", "when light", "if light", "in daylight", "after sunrise"]):
        conditions.append({
            "condition": "state",
            "entity_id": "sun.sun",
            "state": "above_horizon"
        })

    if any(phrase in query_lower for phrase in ["on weekdays", "during weekdays", "weekday only", "weekdays only"]):
        conditions.append({
            "condition": "time",
            "weekday": ["mon", "tue", "wed", "thu", "fri"]
        })
    elif any(phrase in query_lower for phrase in ["on weekends", "during weekends", "weekend only", "weekends only"]):
        conditions.append({
            "condition": "time",
            "weekday": ["sat", "sun"]
        })

    temp_condition = re.search(r"(?:if|when)\s+temp(?:erature)?\s*(above|below|over|under|greater than|less than)\s*(\d+)", query_lower)
    if temp_condition:
        operator = temp_condition.group(1)
        value = int(temp_condition.group(2))
        above = operator in ["above", "over", "greater than"]

        if hass:
            temp_sensors = [s.entity_id for s in hass.states.async_all()
                           if s.domain == "sensor" and "temperature" in s.entity_id.lower()]
            if temp_sensors:
                conditions.append({
                    "condition": "numeric_state",
                    "entity_id": temp_sensors[0],
                    "above" if above else "below": value
                })

    return conditions


def extract_values(query: str, domain: str) -> dict:
    """Extract numeric values like brightness, temperature, position from query."""
    query_lower = query.lower()
    values = {}

    if domain in ["light", "fan"]:
        pct_match = re.search(r"(\d+)\s*(?:%|percent)", query_lower)
        if pct_match:
            values["brightness_pct"] = int(pct_match.group(1))

    if domain == "climate":
        temp_match = re.search(r"(?:set to |to )?(\d+)\s*(?:degrees?|deg|°|celsius|c\b|fahrenheit|f\b)", query_lower)
        if temp_match:
            values["temperature"] = int(temp_match.group(1))

        if "heat" in query_lower and "cool" not in query_lower:
            values["hvac_mode"] = "heat"
        elif "cool" in query_lower or "ac" in query_lower:
            values["hvac_mode"] = "cool"
        elif "auto" in query_lower:
            values["hvac_mode"] = "auto"
        elif "off" in query_lower:
            values["hvac_mode"] = "off"

    if domain == "cover":
        pos_match = re.search(r"(?:position|set to|open to)\s*(\d+)\s*(?:%|percent)?", query_lower)
        if pos_match:
            values["position"] = int(pos_match.group(1))

    if domain == "fan":
        speed_match = re.search(r"(?:speed|set to)\s*(\d+)(?:\s*%)?", query_lower)
        if speed_match:
            values["percentage"] = int(speed_match.group(1))

    if domain == "media_player":
        vol_match = re.search(r"volume\s*(?:to|at)?\s*(\d+)\s*(?:%|percent)?", query_lower)
        if vol_match:
            values["volume_level"] = int(vol_match.group(1)) / 100.0

    if domain == "light":
        kelvin_match = re.search(r"(\d+)\s*(?:k|kelvin)", query_lower)
        if kelvin_match:
            values["kelvin"] = int(kelvin_match.group(1))

    if domain == "light":
        color_map = {
            "red": [255, 0, 0],
            "green": [0, 255, 0],
            "blue": [0, 0, 255],
            "white": [255, 255, 255],
            "yellow": [255, 255, 0],
            "purple": [128, 0, 128],
            "orange": [255, 165, 0],
            "pink": [255, 192, 203],
            "cyan": [0, 255, 255],
            "magenta": [255, 0, 255],
            "warm white": [255, 244, 229],
            "cool white": [201, 226, 255],
        }
        for color_name, rgb in color_map.items():
            if color_name in query_lower:
                values["rgb_color"] = rgb
                break

    return values


def detect_additional_actions(query: str) -> list[dict]:
    """Detect additional actions like notifications, delays, etc."""
    actions = []
    query_lower = query.lower()

    notify_patterns = [
        r"(?:send|notify|alert|message|tell)\s+(?:me|us|notification)\s+[\"']?(.+?)[\"']?$",
        r"(?:send|notify)\s+[\"'](.+?)[\"']",
        r"notification\s+[\"'](.+?)[\"']"
    ]

    for pattern in notify_patterns:
        match = re.search(pattern, query_lower)
        if match:
            message = match.group(1).strip()
            actions.append({
                "type": "notify",
                "message": message
            })
            break

    delay_match = re.search(r"(?:wait|delay|after)\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)", query_lower)
    if delay_match:
        amount = int(delay_match.group(1))
        unit = delay_match.group(2)

        if "minute" in unit:
            delay_time = f"00:{amount:02d}:00"
        elif "hour" in unit:
            delay_time = f"{amount:02d}:00:00"
        else:
            delay_time = f"00:00:{amount:02d}"

        actions.append({
            "type": "delay",
            "duration": delay_time
        })

    return actions


def detect_trigger_type(hass, query: str) -> dict:
    """Detect trigger type from query (time, state, numeric_state, etc.)."""
    query_lower = query.lower()

    if any(phrase in query_lower for phrase in ["motion detected", "motion sensor", "when motion", "if motion", "detects motion"]):
        if hass:
            motion_sensors = [s.entity_id for s in hass.states.async_all()
                             if s.domain == "binary_sensor" and "motion" in s.entity_id.lower()]
            if motion_sensors:
                return {"type": "state", "entity_id": motion_sensors[0], "to": "on"}

    if any(phrase in query_lower for phrase in ["door opens", "door closes", "window opens", "window closes"]):
        state = "on" if "opens" in query_lower else "off"
        if hass:
            door_sensors = [s.entity_id for s in hass.states.async_all()
                           if s.domain == "binary_sensor" and ("door" in s.entity_id.lower() or "window" in s.entity_id.lower())]
            if door_sensors:
                return {"type": "state", "entity_id": door_sensors[0], "to": state}

    numeric_trigger = re.search(r"(?:when|if)\s+(\w+)\s*(above|below|over|under|greater than|less than)\s*(\d+)", query_lower)
    if numeric_trigger:
        sensor_type = numeric_trigger.group(1)
        operator = numeric_trigger.group(2)
        value = int(numeric_trigger.group(3))
        above = operator in ["above", "over", "greater than"]

        if hass:
            sensors = [s.entity_id for s in hass.states.async_all()
                      if s.domain == "sensor" and sensor_type in s.entity_id.lower()]
            if sensors:
                return {"type": "numeric_state", "entity_id": sensors[0],
                       "above" if above else "below": value}

    state_trigger = re.search(r"(?:when|if)\s+(.+?)\s+(?:turns?|becomes?)\s+(on|off|home|away)", query_lower)
    if state_trigger and hass:
        entity_name = state_trigger.group(1).strip()
        to_state = state_trigger.group(2)
        for state in hass.states.async_all():
            if entity_name in state.entity_id.lower() or entity_name in state.attributes.get("friendly_name", "").lower():
                return {"type": "state", "entity_id": state.entity_id, "to": to_state}

    time_patterns = [
        r"\bat\s+(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)",
        r"\bat\s+(\d{1,2}(?:\s*(?:am|pm)))",
        r"(?<!\d)(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)",
        r"(?<!\d)(\d{1,2}(?:\s*(?:am|pm)))"
    ]

    for pattern in time_patterns:
        times = re.findall(pattern, query_lower)
        if times:
            formatted_times = []
            for t in times:
                t = t.strip().lower()
                is_pm = "pm" in t
                has_minutes = ":" in t

                clean_t = t.replace("am", "").replace("pm", "").strip()

                try:
                    if has_minutes:
                        hour_str, minute_str = clean_t.split(":")
                        hour = int(hour_str)
                        minute = int(minute_str)
                    else:
                        hour = int(clean_t)
                        minute = 0

                    if "am" in t or "pm" in t:
                        if is_pm and hour != 12:
                            hour += 12
                        elif not is_pm and hour == 12:
                            hour = 0

                    formatted_times.append(f"{hour:02d}:{minute:02d}:00")
                except ValueError:
                    continue

            if formatted_times:
                return {"type": "time", "times": formatted_times}

    return {"type": "time", "times": ["12:00:00"]}


def extract_automation_name(hass, query: str) -> str:
    """Extract automation name from query."""
    query_lower = query.lower()

    name_patterns = [
        r"(?:called|named|name it|call it)\s+[\"']?([^\"']+)[\"']?",
        r"create\s+(?:an?\s+)?automation\s+[\"']?([^\"']+)[\"']?",
    ]

    for pattern in name_patterns:
        match = re.search(pattern, query_lower)
        if match:
            return match.group(1).strip().title()

    domain = detect_domain(query)
    area = extract_area(query)
    action = "Control"

    if "turn on" in query_lower:
        action = "Turn On"
    elif "turn off" in query_lower:
        action = "Turn Off"
    elif "toggle" in query_lower:
        action = "Toggle"

    if area:
        return f"{area.title()} {domain.title()} {action}"

    return f"New {domain.title()} Automation"
