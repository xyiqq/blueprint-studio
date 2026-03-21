"Natural language extraction for AI queries."
from __future__ import annotations

import re

from .ai_constants import (
    DOMAIN_SYNONYMS, DOMAIN_ACTIONS,
    SUN_TRIGGER_PHRASES, ZONE_TRIGGER_PHRASES,
    WEBHOOK_TRIGGER_PHRASES, MQTT_TRIGGER_PHRASES,
    INTERVAL_TRIGGER_PHRASES, FAN_SPEED_NAMES,
    ACTION_VERB_MAP, MULTI_DOMAIN_CONJUNCTIONS,
)


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


def find_multi_domain_entities(hass, query: str) -> list[dict]:
    """Detect multiple domain+entity pairs from a query.

    Returns list of {domain, entities, action} dicts.
    Example: "turn on fan and lights" -> [
        {domain: "fan", entities: [...], action: "turn_on"},
        {domain: "light", entities: [...], action: "turn_on"},
    ]
    Falls back to empty list if only one domain resolves.
    """
    query_lower = query.lower()

    # Split on conjunctions
    segments = [query_lower]
    for conj in MULTI_DOMAIN_CONJUNCTIONS:
        new_segments = []
        for seg in segments:
            new_segments.extend(seg.split(conj))
        segments = new_segments

    segments = [s.strip() for s in segments if s.strip()]
    if len(segments) < 2:
        return []

    results = []
    seen_domains = set()

    for seg in segments:
        domain = detect_domain(seg)
        if domain in seen_domains:
            continue
        seen_domains.add(domain)

        entities = find_best_entities(hass, seg, domain, limit=3)

        # Determine action
        domain_actions = DOMAIN_ACTIONS.get(domain, {"on": "turn_on", "off": "turn_off"})
        if "off" in seg or "close" in seg or "lock" in seg:
            action = domain_actions.get("off", "turn_off")
        else:
            action = domain_actions.get("on", "turn_on")

        results.append({"domain": domain, "entities": entities, "action": action})

    # Only return if we found genuinely distinct domains
    if len(results) >= 2:
        return results
    return []


def extract_conditions(hass, query: str) -> list[dict]:
    """Extract conditions from natural language (if home, after dark, on weekdays, etc.)."""
    conditions = []
    query_lower = query.lower()

    # --- Person / presence conditions ---
    if any(phrase in query_lower for phrase in ["if home", "when home", "if someone", "if anyone", "when someone", "when anyone"]):
        if hass:
            person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
            if person_entities:
                # "anyone/someone" -> OR group; single person -> simple state
                if any(w in query_lower for w in ["anyone", "someone"]) and len(person_entities) > 1:
                    conditions.append({
                        "condition": "or",
                        "conditions": [
                            {"condition": "state", "entity_id": p, "state": "home"}
                            for p in person_entities
                        ]
                    })
                else:
                    conditions.append({
                        "condition": "state",
                        "entity_id": person_entities[0],
                        "state": "home"
                    })
    elif any(phrase in query_lower for phrase in ["if everyone home", "when everyone home", "if all home"]):
        if hass:
            person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
            if person_entities:
                conditions.append({
                    "condition": "and",
                    "conditions": [
                        {"condition": "state", "entity_id": p, "state": "home"}
                        for p in person_entities
                    ]
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

    # --- Sun conditions ---
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

    # --- Weekday conditions ---
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

    # --- Time range condition: "between 9am and 5pm" / "from 08:00 to 22:00" ---
    time_range = re.search(
        r"(?:between|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:and|to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)",
        query_lower
    )
    if time_range:
        def _parse_time(t: str) -> str:
            t = t.strip()
            is_pm = "pm" in t
            has_mins = ":" in t
            clean = t.replace("am", "").replace("pm", "").strip()
            try:
                if has_mins:
                    h, m = clean.split(":")
                    hour, minute = int(h), int(m)
                else:
                    hour, minute = int(clean), 0
                if is_pm and hour != 12:
                    hour += 12
                elif not is_pm and hour == 12:
                    hour = 0
            except ValueError:
                return "00:00:00"
            return f"{hour:02d}:{minute:02d}:00"

        after_time = _parse_time(time_range.group(1))
        before_time = _parse_time(time_range.group(2))
        conditions.append({
            "condition": "time",
            "after": after_time,
            "before": before_time,
        })

    # --- Zone condition: "when at work", "if at home zone" ---
    zone_cond = re.search(r"(?:if|when)\s+(?:at|in)\s+(home|work|office|school)", query_lower)
    if zone_cond:
        zone_name = zone_cond.group(1)
        zone_entity = f"zone.{zone_name}"
        if hass:
            person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
            person = person_entities[0] if person_entities else "person.your_person"
        else:
            person = "person.your_person"
        conditions.append({
            "condition": "zone",
            "entity_id": person,
            "zone": zone_entity,
        })

    # --- Input boolean condition: "if [helper] is on/off" ---
    input_bool_cond = re.search(
        r"if\s+([\w_]+)\s+is\s+(on|off|enabled|disabled)",
        query_lower
    )
    if input_bool_cond:
        helper_name = input_bool_cond.group(1)
        state_val = "on" if input_bool_cond.group(2) in ("on", "enabled") else "off"
        # Try to find matching input_boolean entity
        entity_id = f"input_boolean.{helper_name}"
        if hass:
            bool_entities = [s.entity_id for s in hass.states.async_all()
                             if s.domain == "input_boolean" and helper_name in s.entity_id.lower()]
            if bool_entities:
                entity_id = bool_entities[0]
        conditions.append({
            "condition": "state",
            "entity_id": entity_id,
            "state": state_val,
        })

    # --- Numeric sensor conditions: temperature, humidity, battery, power ---
    numeric_sensor_patterns = [
        (r"(?:if|when)\s+temp(?:erature)?\s*(above|below|over|under|greater than|less than)\s*(\d+)", "temperature"),
        (r"(?:if|when)\s+humidity\s*(above|below|over|under|greater than|less than)\s*(\d+)", "humidity"),
        (r"(?:if|when)\s+battery\s*(above|below|over|under|greater than|less than)\s*(\d+)", "battery"),
        (r"(?:if|when)\s+power\s*(above|below|over|under|greater than|less than)\s*(\d+)", "power"),
    ]

    for pattern, sensor_type in numeric_sensor_patterns:
        match = re.search(pattern, query_lower)
        if match:
            operator = match.group(1)
            value = int(match.group(2))
            above = operator in ["above", "over", "greater than"]

            entity_id = f"sensor.{sensor_type}"
            if hass:
                sensors = [s.entity_id for s in hass.states.async_all()
                           if s.domain == "sensor" and sensor_type in s.entity_id.lower()]
                if sensors:
                    entity_id = sensors[0]

            conditions.append({
                "condition": "numeric_state",
                "entity_id": entity_id,
                "above" if above else "below": value,
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
        # Named speeds (low/medium/high) — check before numeric
        for speed_name, pct in FAN_SPEED_NAMES.items():
            if re.search(rf"\b{speed_name}\b", query_lower):
                if "percentage" not in values:
                    values["percentage"] = pct
                break

        # Numeric speed
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

    # --- Lock domain ---
    if domain == "lock":
        code_match = re.search(r"(?:with\s+)?code\s+(\d+)", query_lower)
        if code_match:
            values["code"] = code_match.group(1)

    # --- Alarm domain ---
    if domain == "alarm_control_panel":
        code_match = re.search(r"(?:with\s+)?code\s+(\d+)", query_lower)
        if code_match:
            values["code"] = code_match.group(1)
        if "arm away" in query_lower:
            values["arm_mode"] = "arm_away"
        elif "arm home" in query_lower:
            values["arm_mode"] = "arm_home"
        elif "disarm" in query_lower:
            values["arm_mode"] = "disarm"

    # --- Input number domain ---
    if domain == "input_number":
        val_match = re.search(r"(?:set to|value)\s*(\d+(?:\.\d+)?)", query_lower)
        if val_match:
            values["value"] = float(val_match.group(1))

    # --- Input select / select domain ---
    if domain in ("input_select", "select"):
        opt_match = re.search(r"(?:set to|select|choose)\s+([a-z][a-z0-9_ ]+?)(?:\s|$)", query_lower)
        if opt_match:
            values["option"] = opt_match.group(1).strip()

    # --- Humidifier domain ---
    if domain == "humidifier":
        hum_match = re.search(r"(?:set\s+)?humidity\s+(?:to\s+)?(\d+)", query_lower)
        if hum_match:
            values["humidity"] = int(hum_match.group(1))
        for mode_name in ["dry", "sleep", "auto", "comfort", "baby"]:
            if mode_name in query_lower:
                values["mode"] = mode_name
                break

    return values


def detect_additional_actions(query: str) -> list[dict]:
    """Detect additional actions like notifications, delays, scene activation, etc."""
    actions = []
    query_lower = query.lower()

    # --- Notify ---
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

    # --- Notify: "notify me" without specific message ---
    if not any(a["type"] == "notify" for a in actions):
        if re.search(r"\bnotify\s+(?:me|us)\b", query_lower):
            actions.append({
                "type": "notify",
                "message": "Automation triggered"
            })

    # --- Delay ---
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

    # --- Scene activation ---
    scene_match = re.search(r"(?:activate|turn on|enable)\s+(?:the\s+)?(\w+)\s+scene", query_lower)
    if scene_match:
        scene_name = scene_match.group(1)
        actions.append({
            "type": "scene",
            "scene_id": f"scene.{scene_name}"
        })

    # --- Script call ---
    script_match = re.search(r"(?:run|call|execute)\s+(?:the\s+)?(\w+)\s+script", query_lower)
    if script_match:
        script_name = script_match.group(1)
        actions.append({
            "type": "script",
            "script_id": f"script.{script_name}"
        })

    # --- Wait template ---
    wait_match = re.search(r"wait\s+(?:until|for)\s+(.+?)(?:\s+to\s+(\w+))?(?:\s|$)", query_lower)
    if wait_match:
        entity_desc = wait_match.group(1).strip()
        target_state = wait_match.group(2) or "off"
        # Build a simple template
        template = f"{{{{ is_state('{entity_desc.replace(' ', '_')}', '{target_state}') }}}}"
        actions.append({
            "type": "wait_template",
            "template": template,
            "timeout": "00:05:00"
        })

    # --- Repeat ---
    repeat_match = re.search(r"repeat\s+(\d+)\s*times?", query_lower)
    if not repeat_match:
        repeat_match = re.search(r"do\s+.+?(\d+)\s*times?", query_lower)
    if repeat_match:
        count = int(repeat_match.group(1))
        actions.append({
            "type": "repeat",
            "count": count
        })

    return actions


def detect_trigger_type(hass, query: str) -> dict:
    """Detect trigger type from query (time, state, numeric_state, sun, zone, etc.)."""
    query_lower = query.lower()

    # --- Motion ---
    if any(phrase in query_lower for phrase in ["motion detected", "motion sensor", "when motion", "if motion", "detects motion"]):
        if hass:
            motion_sensors = [s.entity_id for s in hass.states.async_all()
                             if s.domain == "binary_sensor" and "motion" in s.entity_id.lower()]
            if motion_sensors:
                return {"type": "state", "entity_id": motion_sensors[0], "to": "on"}

    # --- Door/window ---
    if any(phrase in query_lower for phrase in ["door opens", "door closes", "window opens", "window closes"]):
        state = "on" if "opens" in query_lower else "off"
        if hass:
            door_sensors = [s.entity_id for s in hass.states.async_all()
                           if s.domain == "binary_sensor" and ("door" in s.entity_id.lower() or "window" in s.entity_id.lower())]
            if door_sensors:
                return {"type": "state", "entity_id": door_sensors[0], "to": state}
        return {"type": "state", "entity_id": "binary_sensor.door_sensor", "to": state}

    # --- Sun triggers (check before time patterns) ---
    for event in ("sunset", "sunrise"):
        for phrase in SUN_TRIGGER_PHRASES[event]:
            if phrase in query_lower:
                offset = "+00:00:00"
                # "30 minutes after sunset" → +00:30:00
                after_match = re.search(
                    rf"(\d+)\s*(?:minute|minutes|min|mins)\s+after\s+{event}", query_lower
                )
                before_match = re.search(
                    rf"(\d+)\s*(?:minute|minutes|min|mins)\s+before\s+{event}", query_lower
                )
                if after_match:
                    mins = int(after_match.group(1))
                    offset = f"+{mins // 60:02d}:{mins % 60:02d}:00"
                elif before_match:
                    mins = int(before_match.group(1))
                    offset = f"-{mins // 60:02d}:{mins % 60:02d}:00"
                elif "before" in query_lower:
                    offset = "-00:00:00"

                return {"type": "sun", "event": event, "offset": offset}

    # --- Webhook trigger ---
    if any(phrase in query_lower for phrase in WEBHOOK_TRIGGER_PHRASES):
        return {"type": "webhook", "webhook_id": "blueprint_studio_webhook"}

    # --- MQTT trigger ---
    if any(phrase in query_lower for phrase in MQTT_TRIGGER_PHRASES):
        mqtt_topic = "homeassistant/sensor/your_device/state"
        topic_match = re.search(r"mqtt\s+topic\s+[\"']?([a-zA-Z0-9/_+-]+)[\"']?", query_lower)
        if topic_match:
            mqtt_topic = topic_match.group(1)
        return {"type": "mqtt", "topic": mqtt_topic}

    # --- Interval / repeating triggers ---
    for unit, pattern in INTERVAL_TRIGGER_PHRASES.items():
        interval_match = re.search(pattern, query_lower)
        if interval_match:
            n = int(interval_match.group(1))
            if unit == "minutes":
                return {"type": "time_pattern", "minutes": f"/{n}"}
            elif unit == "hours":
                return {"type": "time_pattern", "hours": f"/{n}"}
            elif unit == "seconds":
                return {"type": "time_pattern", "seconds": f"/{n}"}

    # --- Zone trigger ---
    for event, phrases in ZONE_TRIGGER_PHRASES.items():
        for phrase in phrases:
            if phrase in query_lower:
                if hass:
                    person_entities = [s.entity_id for s in hass.states.async_all() if s.domain == "person"]
                    person = person_entities[0] if person_entities else "person.your_person"
                else:
                    person = "person.your_person"

                zone_name = "zone.home"
                if "work" in query_lower or "office" in query_lower:
                    zone_name = "zone.work"
                elif "school" in query_lower:
                    zone_name = "zone.school"

                return {"type": "zone", "entity_id": person, "zone": zone_name, "event": event}

    # --- Numeric trigger ---
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

        return {"type": "numeric_state", "entity_id": f"sensor.{sensor_type}",
                "above" if above else "below": value}

    # --- State trigger ---
    state_trigger = re.search(r"(?:when|if)\s+(.+?)\s+(?:turns?|becomes?)\s+(on|off|home|away)", query_lower)
    if state_trigger and hass:
        entity_name = state_trigger.group(1).strip()
        to_state = state_trigger.group(2)
        for state in hass.states.async_all():
            if entity_name in state.entity_id.lower() or entity_name in state.attributes.get("friendly_name", "").lower():
                return {"type": "state", "entity_id": state.entity_id, "to": to_state}

    # --- Time trigger ---
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

    # --- Improved fallback: use detected domain ---
    domain = detect_domain(query)
    return {"type": "state", "entity_id": f"{domain}.your_device", "to": "on"}


def extract_automation_name(hass, query: str) -> str:
    """Extract automation name from query with expanded action vocabulary."""
    query_lower = query.lower()

    # Explicit name patterns
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

    # Try multi-word action phrases first (order: longest first)
    multi_word_actions = [k for k in ACTION_VERB_MAP if " " in k]
    for phrase in sorted(multi_word_actions, key=len, reverse=True):
        if phrase in query_lower:
            action = ACTION_VERB_MAP[phrase]
            break
    else:
        # Single-word verbs
        words = re.findall(r'\b\w+\b', query_lower)
        for word in words:
            if word in ACTION_VERB_MAP:
                action = ACTION_VERB_MAP[word]
                break

    # Try to get friendly name from hass
    entity_name = ""
    if hass:
        entities = find_best_entities(hass, query, domain, limit=1)
        if entities and not entities[0].endswith(".your_device"):
            state = hass.states.get(entities[0])
            if state:
                entity_name = state.attributes.get("friendly_name", "")

    if entity_name:
        if area:
            return f"{action} {entity_name}"
        return f"{action} {entity_name}"

    if area:
        return f"{area.title()} {domain.replace('_', ' ').title()} {action}"

    return f"New {domain.replace('_', ' ').title()} Automation"
