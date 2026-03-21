"AI management for Blueprint Studio — thin orchestrator."
from __future__ import annotations

import logging
import re
import json
import time
import aiohttp

from aiohttp import web
from homeassistant.core import HomeAssistant

from .util import json_response, json_message
from .ai_constants import DOMAIN_ACTIONS
from .ai_validators import check_syntax as _check_syntax, check_yaml, check_jinja
from .ai_nlp import (
    detect_domain, extract_area, find_best_entities,
    extract_conditions, extract_values, detect_additional_actions,
    detect_trigger_type, extract_automation_name, find_multi_domain_entities,
)
from .ai_generators import (
    build_data_block, build_conditions_yaml, build_target_yaml,
    generate_multi_intent_automation, generate_single_intent_automation,
    generate_multi_domain_automation, build_sun_trigger_yaml,
    get_scene_defaults, get_scene_icon, get_scene_description,
    get_script_description,
)

_LOGGER = logging.getLogger(__name__)


class AIManager:
    """Class to handle AI operations with advanced natural language understanding."""

    def __init__(self, hass: HomeAssistant | None, data: dict) -> None:
        """Initialize AI manager."""
        self.hass = hass
        self.data = data

    def check_syntax(self, content: str, file_path: str = "") -> web.Response:
        """Universal syntax checker — delegates to ai_validators."""
        return _check_syntax(content, file_path)

    def check_yaml(self, content: str, strict_mode: bool = True) -> web.Response:
        """Check YAML syntax — delegates to ai_validators."""
        return check_yaml(content, strict_mode)

    def check_jinja(self, content: str) -> web.Response:
        """Check Jinja2 syntax — delegates to ai_validators."""
        return check_jinja(content)

    def check_json(self, content: str) -> web.Response:
        """Check JSON syntax — delegates to ai_validators."""
        from .ai_validators import check_json
        return check_json(content)

    def check_python(self, content: str) -> web.Response:
        """Check Python syntax — delegates to ai_validators."""
        from .ai_validators import check_python
        return check_python(content)

    def check_javascript(self, content: str) -> web.Response:
        """Check JavaScript syntax — delegates to ai_validators."""
        from .ai_validators import check_javascript
        return check_javascript(content)

    async def _call_cloud_api(self, provider: str, settings: dict, system: str, prompt: str, ai_model: str) -> web.Response:
        """Consolidated cloud API handler for all providers."""
        try:
            key = settings.get(f"{provider}ApiKey")
            if not key:
                return json_message(f"No API key for {provider}", status_code=400)

            if provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{ai_model or 'gemini-3-flash-preview'}:generateContent?key={key}"
                payload = {"contents": [{"parts": [{"text": f"{system}\n\n{prompt}"}]}]}
                headers = {}
                parse_fn = lambda r: r['candidates'][0]['content']['parts'][0]['text']
            elif provider == "openai":
                url = "https://api.openai.com/v1/chat/completions"
                payload = {"model": ai_model or "gpt-5.2", "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
                headers = {"Authorization": f"Bearer {key}"}
                parse_fn = lambda r: r['choices'][0]['message']['content']
            elif provider == "claude":
                url = "https://api.anthropic.com/v1/messages"
                payload = {"model": ai_model or "claude-3-5-sonnet-20241022", "max_tokens": 4096, "system": system, "messages": [{"role": "user", "content": prompt}]}
                headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
                parse_fn = lambda r: r['content'][0]['text']
            else:
                return json_message(f"Unknown provider: {provider}", status_code=400)

            async with aiohttp.ClientSession() as s:
                async with s.post(url, headers=headers, json=payload) as r:
                    if r.status == 200:
                        res = await r.json()
                        return json_response({"success": True, "response": parse_fn(res)})
                    return json_message(f"{provider.title()} Error: {r.status}", status_code=r.status)
        except Exception as e:
            _LOGGER.error("Cloud API error: %s", e)
            return json_message(f"API error: {str(e)}", status_code=500)

    async def query(self, query: str | None, current_file: str | None, file_content: str | None,
                   ai_type: str | None = None, cloud_provider: str | None = None,
                   ai_model: str | None = None) -> web.Response:
        """Process AI query with advanced natural language understanding."""
        try:
            if not query:
                return json_message("Query is empty", status_code=400)

            query_lower = query.lower()
            settings = self.data.get("settings", {})

            # Use provided ai_type from request, or get from settings
            if not ai_type:
                ai_type = settings.get("aiType")
                if not ai_type:
                    old_provider = settings.get("aiProvider", "local")
                    if old_provider == "local":
                        ai_type = "rule-based"
                    elif old_provider in ["gemini", "openai", "claude"]:
                        ai_type = "cloud"
                        if not cloud_provider:
                            cloud_provider = old_provider
                    else:
                        ai_type = "rule-based"

            if ai_type == "cloud":
                if not cloud_provider:
                    cloud_provider = settings.get("cloudProvider") or settings.get("aiProvider", "gemini")
                if not ai_model:
                    ai_model = settings.get("aiModel")

            # Cloud AI providers
            if ai_type == "cloud" and cloud_provider in ["gemini", "openai", "claude"]:
                system = """You are the Blueprint Studio AI Copilot, a Senior Home Assistant Configuration Expert.

CRITICAL RULES (2024+ Best Practices):
1. Use modern plural keys: triggers:, conditions:, actions:
2. Use modern syntax: - trigger: platform, - action: domain.service
3. Every automation MUST have id: 'XXXXXXXXXXXXX' (13-digit timestamp)
4. Include metadata: {} in all actions
5. Use conditions: [] if no conditions
6. Use mode: single or restart
7. NEVER use legacy service: key - always use action:

Example modern automation:
```yaml
- id: '1738012345678'
  alias: Kitchen Light Control
  triggers:
  - trigger: time
    at: '19:00:00'
  conditions: []
  actions:
  - action: light.turn_on
    metadata: {}
    target:
      entity_id: light.kitchen
    data:
      brightness_pct: 80
  mode: single
```"""
                context = f"Current file:\n```yaml\n{file_content}\n```\n" if file_content else ""
                prompt = f"{context}\nUser request: {query}"

                return await self._call_cloud_api(cloud_provider, settings, system, prompt, ai_model)

            # ===== ADVANCED LOCAL LOGIC ENGINE =====

            # 1. Intent Detection: Analysis/Fix
            if any(word in query_lower for word in ["check", "fix", "analyze", "validate", "error", "debug", "lint"]):
                if not file_content:
                    return json_response({"success": False, "response": "Please open a file to check for errors."})

                is_jinja = "jinja" in query_lower or (current_file and current_file.endswith((".jinja", ".jinja2", ".j2")))

                if is_jinja:
                    check_result = check_jinja(file_content)
                    result_data = check_result._body if hasattr(check_result, '_body') else "{}"
                    try:
                        res = json.loads(result_data)
                        if res.get("valid"):
                            return json_response({"success": True, "response": f"✅ **Jinja Analysis Passed**\n\n{res.get('message')}\n\n**Tip:** {res.get('tip')}"})
                        else:
                            errors = "\n".join([f"- Line {e['line']}: {e['message']} (Fix: `{e['solution']}`)" for e in res.get('errors', [])])
                            return json_response({"success": True, "response": f"❌ **Found {res.get('error_count')} Jinja Errors**\n\n{errors}"})
                    except Exception:
                        return check_result

                else:
                    check_result = check_yaml(file_content)
                    result_data = check_result._body if hasattr(check_result, '_body') else "{}"
                    try:
                        res = json.loads(result_data)
                        if res.get("valid"):
                            msg = f"✅ **YAML Analysis Passed**\n\n{res.get('message')}"
                            if res.get("warnings"):
                                warnings = "\n".join([f"- Line {w['line']}: {w['message']}" for w in res.get('warnings', [])])
                                msg += f"\n\n**Warnings:**\n{warnings}"
                            return json_response({"success": True, "response": msg})
                        else:
                            errors = "\n".join([f"- Line {e['line']}: {e['message']} (Fix: `{e['solution']}`)" for e in res.get('errors', [])])
                            return json_response({"success": True, "response": f"❌ **Found {res.get('error_count')} YAML Errors**\n\n{errors}"})
                    except Exception:
                        return check_result

            # 2. Intent Detection: Generation (Automation/Script/Scene)
            config_type = "automation"
            if "scene" in query_lower:
                config_type = "scene"
            elif "script" in query_lower:
                config_type = "script"

            domain = detect_domain(query)
            entities = find_best_entities(self.hass, query, domain, limit=5)
            values = extract_values(query, domain)
            conditions = extract_conditions(self.hass, query)
            trigger_info = detect_trigger_type(self.hass, query)
            name = extract_automation_name(self.hass, query)

            is_list = current_file and any(f in current_file for f in ["automations.yaml", "scripts.yaml", "scenes.yaml"])
            ind = "" if is_list else "  "
            hdr = f"{config_type}:\n  " if not is_list else ""
            uid = str(int(time.time() * 1000))

            actions = DOMAIN_ACTIONS.get(domain, {"on": "turn_on", "off": "turn_off"})

            # ===== SCENE GENERATION =====
            if config_type == "scene":
                scene_type = None
                if any(word in query_lower for word in ["morning", "wake", "breakfast"]):
                    scene_type = "morning"
                elif any(word in query_lower for word in ["evening", "night", "bedtime", "sleep"]):
                    scene_type = "evening"
                elif any(word in query_lower for word in ["movie", "cinema", "tv", "watch"]):
                    scene_type = "movie"
                elif any(word in query_lower for word in ["reading", "read", "study"]):
                    scene_type = "reading"
                elif any(word in query_lower for word in ["romantic", "dinner", "date"]):
                    scene_type = "romantic"
                elif any(word in query_lower for word in ["party", "celebration"]):
                    scene_type = "party"
                elif any(word in query_lower for word in ["relax", "chill"]):
                    scene_type = "relax"

                entity_states = {}
                scene_defaults = get_scene_defaults(scene_type)

                for ent in entities[:10]:
                    ent_domain = ent.split('.')[0]

                    if ent_domain == "light":
                        state_config = ["state: on"]

                        if "brightness_pct" in values:
                            state_config.append(f"brightness_pct: {values['brightness_pct']}")
                        elif scene_type and "brightness" in scene_defaults:
                            state_config.append(f"brightness_pct: {scene_defaults['brightness']}")

                        if "rgb_color" in values:
                            state_config.append(f"rgb_color: {values['rgb_color']}")
                        elif scene_type and "color" in scene_defaults:
                            state_config.append(f"rgb_color: {scene_defaults['color']}")

                        if "kelvin" in values:
                            state_config.append(f"kelvin: {values['kelvin']}")
                        elif scene_type and "kelvin" in scene_defaults:
                            state_config.append(f"kelvin: {scene_defaults['kelvin']}")

                        if "transition" in query_lower:
                            transition_match = re.search(r"transition\s*(?:of|for)?\s*(\d+)", query_lower)
                            if transition_match:
                                state_config.append(f"transition: {transition_match.group(1)}")
                            else:
                                state_config.append("transition: 2")
                        elif scene_type:
                            state_config.append("transition: 1")

                        entity_states[ent] = "\n" + "\n".join([f"{ind}    {cfg}" for cfg in state_config])

                    elif ent_domain == "climate":
                        state_config = []
                        if "temperature" in values:
                            state_config.append(f"temperature: {values['temperature']}")
                        if "hvac_mode" in values:
                            state_config.append(f"hvac_mode: {values['hvac_mode']}")

                        if state_config:
                            entity_states[ent] = "\n" + "\n".join([f"{ind}    {cfg}" for cfg in state_config])
                        else:
                            entity_states[ent] = "heat"

                    elif ent_domain == "cover":
                        if "position" in values:
                            entity_states[ent] = f"\n{ind}    state: open\n{ind}    position: {values['position']}"
                        else:
                            entity_states[ent] = "open" if "open" in query_lower else "closed"

                    elif ent_domain == "media_player":
                        if "volume_level" in values:
                            entity_states[ent] = f"\n{ind}    state: on\n{ind}    volume_level: {values['volume_level']}"
                        else:
                            entity_states[ent] = "on"

                    else:
                        entity_states[ent] = "on" if "on" in query_lower or "activate" in query_lower else "off"

                scene_name = name.lower().replace(' ', '_')
                entities_yaml = "\n".join([f"{ind}    {ent}:{' ' + state if isinstance(state, str) else state}" for ent, state in entity_states.items()])

                icon = get_scene_icon(scene_type, query_lower)
                description = get_scene_description(scene_type, name)

                code = f"""{hdr}{scene_name}:
{ind}  name: {name}
{ind}  icon: {icon}
{ind}  entities:
{entities_yaml}"""

                return json_response({"success": True, "response": f"Generated Scene:\n\n```yaml\n{code}\n```\n\n💡 **Tip:** Activate with `scene.turn_on` or via UI"})

            # ===== SCRIPT GENERATION =====
            if config_type == "script":
                multi_step = any(word in query_lower for word in ["then", "after", "sequence", "followed by", "next", "and then"])

                script_name = name.lower().replace(' ', '_')

                sequence_steps = []

                action_name = actions.get("on" if "on" in query_lower or "turn on" in query_lower else "off", "turn_on")
                data_block = build_data_block(values, domain, ind)
                target_yaml = build_target_yaml(entities, ind)

                if len(entities) > 1 and any(word in query_lower for word in ["all", "every"]):
                    for ent in entities[:5]:
                        sequence_steps.append(f"""{ind}  - action: {domain}.{action_name}
{ind}    metadata: {{}}
{ind}    target:
{ind}      entity_id: {ent}{data_block}""")
                else:
                    sequence_steps.append(f"""{ind}  - action: {domain}.{action_name}
{ind}    metadata: {{}}
{ind}    {target_yaml}{data_block}""")

                additional_actions = detect_additional_actions(query_lower)
                for add_action in additional_actions:
                    if add_action["type"] == "delay":
                        duration_parts = add_action['duration'].split(':')
                        hours, minutes, seconds = int(duration_parts[0]), int(duration_parts[1]), int(duration_parts[2])
                        sequence_steps.append(f"""{ind}  - delay:
{ind}      hours: {hours}
{ind}      minutes: {minutes}
{ind}      seconds: {seconds}""")
                    elif add_action["type"] == "notify":
                        sequence_steps.append(f"""{ind}  - action: notify.notify
{ind}    metadata: {{}}
{ind}    data:
{ind}      message: "{add_action['message']}" """)

                if multi_step and any(phrase in query_lower for phrase in ["then off", "then turn off", "then close"]):
                    off_action = actions.get("off", "turn_off")
                    sequence_steps.append(f"""{ind}  - action: {domain}.{off_action}
{ind}    metadata: {{}}
{ind}    {target_yaml}
{ind}    data: {{}}""")

                sequence_yaml = "\n".join(sequence_steps)

                mode = "single"
                if any(word in query_lower for word in ["parallel", "simultaneously", "at once"]):
                    mode = "parallel"
                elif any(word in query_lower for word in ["restart", "interrupt"]):
                    mode = "restart"
                elif any(word in query_lower for word in ["queue", "queued"]):
                    mode = "queued"

                fields_yaml = ""
                if any(word in query_lower for word in ["variable", "input", "parameter"]):
                    fields_yaml = f"""
{ind}  fields:
{ind}    brightness:
{ind}      description: Brightness level
{ind}      example: 80"""

                code = f"""{hdr}{script_name}:
{ind}  alias: {name}
{ind}  description: {get_script_description(query_lower)}
{ind}  mode: {mode}{fields_yaml}
{ind}  sequence:
{sequence_yaml}"""

                return json_response({"success": True, "response": f"Generated Script:\n\n```yaml\n{code}\n```\n\n💡 **Tip:** Call with `script.{script_name}` or via UI"})

            # ===== AUTOMATION GENERATION =====
            multi_intent = ("on" in query_lower and "off" in query_lower) or ("open" in query_lower and "close" in query_lower)

            # Check for multi-domain query first
            domain_intents = find_multi_domain_entities(self.hass, query)

            if domain_intents:
                code = generate_multi_domain_automation(
                    uid, name, domain_intents, trigger_info, conditions, ind, hdr
                )
                domains_str = " and ".join(i["domain"] for i in domain_intents)
                response_msg = (
                    f"Generated Multi-Domain Automation:\n\n```yaml\n{code}\n```\n\n"
                    f"💡 Controls **{domains_str}** — adjust entity IDs as needed."
                )
            elif trigger_info["type"] == "sun":
                code = generate_single_intent_automation(
                    uid, name, domain, actions, entities, trigger_info, values, conditions, ind, hdr, query_lower,
                    detect_additional_actions
                )
                event = trigger_info.get("event", "sunset")
                offset = trigger_info.get("offset", "+00:00:00")
                offset_note = f" with offset `{offset}`" if offset not in ("+00:00:00", "-00:00:00") else ""
                response_msg = (
                    f"Generated Modern Automation:\n\n```yaml\n{code}\n```\n\n"
                    f"☀️ Triggered at **{event}**{offset_note}."
                )
            elif trigger_info["type"] == "time_pattern":
                code = generate_single_intent_automation(
                    uid, name, domain, actions, entities, trigger_info, values, conditions, ind, hdr, query_lower,
                    detect_additional_actions
                )
                pattern_key = next((k for k in ("hours", "minutes", "seconds") if k in trigger_info), "minutes")
                pattern_val = trigger_info.get(pattern_key, "/5")
                response_msg = (
                    f"Generated Modern Automation:\n\n```yaml\n{code}\n```\n\n"
                    f"🔄 Repeating trigger: every `{pattern_val}` {pattern_key}."
                )
            elif trigger_info["type"] == "zone":
                code = generate_single_intent_automation(
                    uid, name, domain, actions, entities, trigger_info, values, conditions, ind, hdr, query_lower,
                    detect_additional_actions
                )
                event = trigger_info.get("event", "enter")
                zone = trigger_info.get("zone", "zone.home")
                response_msg = (
                    f"Generated Modern Automation:\n\n```yaml\n{code}\n```\n\n"
                    f"📍 Triggered when person **{event}s** `{zone}`."
                )
            elif multi_intent and trigger_info["type"] == "time" and len(trigger_info.get("times", [])) >= 2:
                code = generate_multi_intent_automation(
                    uid, name, domain, actions, entities, trigger_info["times"], values, conditions, ind, hdr
                )
                response_msg = f"Generated Modern Automation:\n\n```yaml\n{code}\n```"
            else:
                code = generate_single_intent_automation(
                    uid, name, domain, actions, entities, trigger_info, values, conditions, ind, hdr, query_lower,
                    detect_additional_actions
                )
                response_msg = f"Generated Modern Automation:\n\n```yaml\n{code}\n```"

            return json_response({"success": True, "response": response_msg})

        except Exception as e:
            _LOGGER.error(f"AI Error: {e}", exc_info=True)
            return json_message(str(e), status_code=500)
