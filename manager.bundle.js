(function(global){const location=global.location||{};const isLocalEnvironment=location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname.startsWith('192.168.')||location.protocol==='file:';const BACKEND_ORIGIN='https://danddy-api.onrender.com';const API_BASE_URL=`${BACKEND_ORIGIN}/api`;const TOKEN_STORAGE_KEY='dnd_auth_token';const USER_STORAGE_KEY='dnd_user_info';const CHARACTER_STORAGE_KEY='dnd_characters';const DEBUG=isLocalEnvironment;global.DanddyConfig={isLocalEnvironment,BACKEND_ORIGIN,API_BASE_URL,TOKEN_STORAGE_KEY,USER_STORAGE_KEY,CHARACTER_STORAGE_KEY,DEBUG,};if(!DEBUG&&global.console){try{['log','info','debug'].forEach((method)=>{if(typeof global.console[method]==='function'){global.console[method]=()=>{};}});}catch(e){}}})(window);(function(global){const cfg=global.DanddyConfig||{};const API_BASE_URL=cfg.API_BASE_URL||'https://danddy-api.onrender.com/api';const TOKEN_KEY=cfg.TOKEN_STORAGE_KEY||'dnd_auth_token';const USER_KEY=cfg.USER_STORAGE_KEY||'dnd_user_info';const DEBUG=!!cfg.DEBUG;const AuthService=(global.AuthService=global.AuthService||{});Object.assign(AuthService,{TOKEN_KEY,USER_KEY,getToken(){return global.localStorage.getItem(this.TOKEN_KEY);},setToken(token){if(!token)return;global.localStorage.setItem(this.TOKEN_KEY,token);},clearToken(){global.localStorage.removeItem(this.TOKEN_KEY);global.localStorage.removeItem(this.USER_KEY);},getCurrentUser(){const raw=global.localStorage.getItem(this.USER_KEY);return raw?JSON.parse(raw):null;},setCurrentUser(user){if(!user)return;global.localStorage.setItem(this.USER_KEY,JSON.stringify(user));},isAuthenticated(){return!!this.getToken();},logout(){this.stopSessionMonitor();this.clearToken();try{global.localStorage.removeItem('danddy_builder_session');}catch(e){}},async _request(path,{method='GET',body,headers}={}){const url=`${API_BASE_URL}${path}`;const baseHeaders=headers||{};const scrubBodyForLog=(payload)=>{if(!payload||typeof payload!=='object')return payload;const clone={...payload};const sensitiveKeys=['password','confirm_password','new_password','token'];sensitiveKeys.forEach((key)=>{if(key in clone){const value=String(clone[key]??'');clone[key]=value?`*** (${value.length} chars)`:'***';}});return clone;};if(DEBUG){console.log('[AuthService] HTTP request',{url,method,body:scrubBodyForLog(body),});}
try{const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json',...baseHeaders}:baseHeaders,body:body?JSON.stringify(body):undefined,});if(!response.ok){let detail=`Request failed (${response.status})`;let backendDetail=null;try{const errJson=await response.json();if(DEBUG){console.warn('[AuthService] HTTP error response',{url,status:response.status,payload:errJson,});}
if(errJson&&errJson.detail){if(typeof errJson.detail==='string'){detail=errJson.detail;}else if(Array.isArray(errJson.detail)&&errJson.detail.length){const first=errJson.detail[0];if(first&&first.msg){detail=first.msg;}else{detail=JSON.stringify(errJson.detail);}}else{detail=JSON.stringify(errJson.detail);}
backendDetail=errJson.detail;}}catch(_){}
if(DEBUG){console.warn('[AuthService] HTTP request failed',{url,status:response.status,detail,backendDetail,});}
throw new Error(detail);}
if(response.status===204)return null;const json=await response.json();if(DEBUG){console.log('[AuthService] HTTP response OK',{url,method,status:response.status,});}
return json;}catch(error){console.error('[AuthService] Request error:',error);throw error;}},async register(email,password,role='player'){try{const derivedUsername=typeof email==='string'&&email.includes('@')?email.split('@')[0]:email;const data=await this._request('/auth/register',{method:'POST',body:{username:derivedUsername,email,password,role},});if(!data||!data.access_token){throw new Error('Registration succeeded but no token was returned.');}
this.setToken(data.access_token);const profile=await this.fetchProfile();const user=profile&&Object.keys(profile).length?profile:{email,role};this.setCurrentUser(user);return{success:true,user};}catch(error){return{success:false,error:error.message||'Registration failed'};}},async login(email,password){const url=`${API_BASE_URL}/auth/token`;if(DEBUG){console.log('[AuthService] Login attempt',{url,email,});}
try{const formData=new FormData();formData.append('username',email);formData.append('password',password);const response=await fetch(url,{method:'POST',body:formData,});if(DEBUG){console.log('[AuthService] Login response received',{url,status:response.status,ok:response.ok,});}
if(!response.ok){let detail='Login failed';let backendPayload=null;try{const errJson=await response.json();backendPayload=errJson;if(errJson&&errJson.detail)detail=errJson.detail;}catch(_){}
if(DEBUG){console.warn('[AuthService] Login HTTP error',{url,status:response.status,detail,backendPayload,});}
throw new Error(detail);}
const data=await response.json();if(!data||!data.access_token){throw new Error('Login succeeded but no token was returned.');}
if(DEBUG){console.log('[AuthService] Login succeeded, token received',{url,});}
this.setToken(data.access_token);const profile=await this.fetchProfile();if(profile){this.setCurrentUser(profile);}
return{success:true,user:profile};}catch(error){console.error('[AuthService] Login error:',error);return{success:false,error:error.message||'Login failed'};}},async forgotPassword(email){try{const data=await this._request('/auth/password/forgot',{method:'POST',body:{email},});return{success:true,message:(data&&data.message)||'If an account with that email exists, a password reset link has been sent.',debugToken:data&&data.debug_reset_token?data.debug_reset_token:null,};}catch(error){return{success:false,error:error.message||'Password reset request failed',};}},async resetPassword(token,newPassword){try{const data=await this._request('/auth/password/reset',{method:'POST',body:{token,new_password:newPassword},});if(!data||!data.access_token){throw new Error('Password reset succeeded but no token was returned.');}
this.setToken(data.access_token);const profile=await this.fetchProfile();if(profile){this.setCurrentUser(profile);}
return{success:true,user:profile};}catch(error){return{success:false,error:error.message||'Password reset failed'};}},async fetchProfile(){const token=this.getToken();if(!token)return null;try{const response=await fetch(`${API_BASE_URL}/auth/me`,{headers:{Authorization:`Bearer ${token}`},});if(!response.ok){if(response.status===401){let backendDetail=null;try{const errJson=await response.json();if(errJson&&errJson.detail){backendDetail=errJson.detail;}}catch(_){}
console.warn('[AuthService] Token rejected by /auth/me; clearing local session.',{status:response.status,detail:backendDetail,});this.clearToken();return null;}
if(DEBUG){console.warn('[AuthService] /auth/me non-401 error',{status:response.status,});}
throw new Error('Failed to fetch user profile');}
const profile=await response.json();if(DEBUG){console.log('[AuthService] /auth/me profile loaded',profile);}
return profile;}catch(error){console.error('[AuthService] Fetch profile error:',error);return null;}},async verifyToken(){const profile=await this.fetchProfile();return!!profile;},_sessionCheckInterval:null,_lastSessionCheck:0,_visibilityHandler:null,_sessionMonitorActive:false,SESSION_CHECK_INTERVAL_MS:5*60*1000,SESSION_CHECK_COOLDOWN_MS:30*1000,startSessionMonitor(){if(this._sessionMonitorActive){if(DEBUG){console.log('[AuthService] Session monitor already active');}
return;}
if(!this.isAuthenticated()){if(DEBUG){console.log('[AuthService] Not authenticated, skipping session monitor');}
return;}
if(DEBUG){console.log('[AuthService] Starting session monitor');}
this._sessionMonitorActive=true;this._lastSessionCheck=Date.now();this._visibilityHandler=()=>this._onVisibilityChange();document.addEventListener('visibilitychange',this._visibilityHandler);this._sessionCheckInterval=setInterval(()=>{this._performSessionCheck('interval');},this.SESSION_CHECK_INTERVAL_MS);},stopSessionMonitor(){if(DEBUG){console.log('[AuthService] Stopping session monitor');}
this._sessionMonitorActive=false;if(this._visibilityHandler){document.removeEventListener('visibilitychange',this._visibilityHandler);this._visibilityHandler=null;}
if(this._sessionCheckInterval){clearInterval(this._sessionCheckInterval);this._sessionCheckInterval=null;}},_onVisibilityChange(){if(document.visibilityState!=='visible'){return;}
const timeSinceLastCheck=Date.now()-this._lastSessionCheck;if(timeSinceLastCheck<this.SESSION_CHECK_COOLDOWN_MS){if(DEBUG){console.log('[AuthService] Skipping visibility check (cooldown)');}
return;}
this._performSessionCheck('visibility');},async _performSessionCheck(trigger){if(!this.isAuthenticated()){this.stopSessionMonitor();return;}
if(DEBUG){console.log(`[AuthService] Performing session check (trigger: ${trigger})`);}
this._lastSessionCheck=Date.now();try{const isValid=await this.verifyToken();if(!isValid){if(DEBUG){console.log('[AuthService] Session expired detected');}
this._handleSessionExpired();}else if(DEBUG){console.log('[AuthService] Session still valid');}}catch(error){console.warn('[AuthService] Session check failed (network?):',error);}},_handleSessionExpired(){this.stopSessionMonitor();this.clearToken();const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'token_expired'},});window.dispatchEvent(event);if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}},});})(window);(function(global){const Mapper={fromBuilderToBackend(character){if(!character)return null;return{name:character.name||'',race:character.race||'',character_class:character.class||'',level:character.level||1,background:character.background||null,alignment:this._mapAlignmentFromBuilder(character.alignment),experience_points:character.experiencePoints||0,strength:character.abilities?.str||10,dexterity:character.abilities?.dex||10,constitution:character.abilities?.con||10,intelligence:character.abilities?.int||10,wisdom:character.abilities?.wis||10,charisma:character.abilities?.cha||10,hit_points_max:character.hitPoints||10,hit_points_current:character.hitPoints||10,hit_points_temp:0,armor_class:this._calculateACFromBuilder(character),initiative:this._calculateInitiativeFromBuilder(character),speed:this._getSpeedFromBuilder(character),death_save_successes:0,death_save_failures:0,saving_throw_proficiencies:character.savingThrows||[],skill_proficiencies:character.skillProficiencies||[],skill_expertises:[],tool_proficiencies:character.toolProficiencies||[],languages:character.languages||[],racial_traits:this._arrayToDict(character.racialTraits),class_features:this._arrayToDict(character.classFeatures),feats:[],background_feature:character.backgroundFeature||{},personality_traits:character.personalityTrait||null,ideals:character.ideal||null,bonds:character.bond||null,flaws:character.flaw||null,appearance:character.appearance||null,backstory:character.backstory||null,sex:character.sex||null,ascii_portrait:character.asciiPortrait||null,original_portrait_url:character.originalPortraitUrl||null,custom_portrait_ascii:character.customPortraitAscii||null,custom_portrait_count:character.customPortraitCount||0,portrait_metadata:character.portraitMetadata||{},inventory:this._arrayToDict(character.equipment),spellcasting_ability:character.spellcastingAbility||null,spell_save_dc:character.spellSaveDC||null,spell_attack_bonus:character.spellAttackBonus||null,spell_slots:character.spellSlots||{},spell_slots_used:{},cantrips:this._spellsToStringArray(character.cantrips),spells_known:this._spellsToStringArray(character.spellsKnown),spells_prepared:this._spellsToStringArray(character.spellsPrepared),conditions:[],attacks:this._arrayToDict(character.attacks),copper_pieces:character.copper||0,silver_pieces:character.silver||0,electrum_pieces:character.electrum||0,gold_pieces:character.gold||0,platinum_pieces:character.platinum||0,campaign_id:character.campaignId||null,};},fromBackendToBuilder(backendChar){if(!backendChar)return null;return{id:backendChar.id,name:backendChar.name,race:backendChar.race,class:backendChar.character_class,level:backendChar.level,background:backendChar.background,alignment:this._mapAlignmentFromBackend(backendChar.alignment),experiencePoints:backendChar.experience_points,abilities:{str:backendChar.strength,dex:backendChar.dexterity,con:backendChar.constitution,int:backendChar.intelligence,wis:backendChar.wisdom,cha:backendChar.charisma,},hitPoints:backendChar.hit_points_max,currentHitPoints:backendChar.hit_points_current,armorClass:backendChar.armor_class,initiative:backendChar.initiative,speed:backendChar.speed,savingThrows:backendChar.saving_throw_proficiencies,skillProficiencies:backendChar.skill_proficiencies,toolProficiencies:backendChar.tool_proficiencies,languages:backendChar.languages,racialTraits:backendChar.racial_traits,classFeatures:backendChar.class_features,backgroundFeature:backendChar.background_feature,personalityTrait:backendChar.personality_traits,ideal:backendChar.ideals,bond:backendChar.bonds,flaw:backendChar.flaws,appearance:backendChar.appearance,backstory:backendChar.backstory,sex:backendChar.sex||null,asciiPortrait:backendChar.ascii_portrait,originalPortraitUrl:backendChar.original_portrait_url,customPortraitAscii:backendChar.custom_portrait_ascii,customPortraitCount:backendChar.custom_portrait_count,portraitMetadata:backendChar.portrait_metadata,equipment:backendChar.inventory,spellcastingAbility:backendChar.spellcasting_ability,spellSaveDC:backendChar.spell_save_dc,spellAttackBonus:backendChar.spell_attack_bonus,spellSlots:backendChar.spell_slots,cantrips:backendChar.cantrips||[],spellsKnown:backendChar.spells_known||[],spellsPrepared:backendChar.spells_prepared||[],attacks:backendChar.attacks,copper:backendChar.copper_pieces,silver:backendChar.silver_pieces,electrum:backendChar.electrum_pieces,gold:backendChar.gold_pieces,platinum:backendChar.platinum_pieces,campaignId:backendChar.campaign_id,ownerId:backendChar.owner_id,_backendData:backendChar,};},fromManagerToBackend(character){if(!character)return null;const rawBackgroundFeature=character.backgroundFeature||character.backgroundData?.feature||{};const backgroundFeatureDict=typeof rawBackgroundFeature==='string'?{name:rawBackgroundFeature}:rawBackgroundFeature;return{name:character.name||'Unnamed Character',race:character.race||character.raceData?.name||'Human',character_class:character.class||character.classData?.name||'Fighter',level:character.level||1,background:character.background||character.backgroundData?.name||null,alignment:this._mapAlignmentFromManager(character.alignment),experience_points:character.experiencePoints||0,strength:character.abilities?.str||character.abilityScores?.str||10,dexterity:character.abilities?.dex||character.abilityScores?.dex||10,constitution:character.abilities?.con||character.abilityScores?.con||10,intelligence:character.abilities?.int||character.abilityScores?.int||10,wisdom:character.abilities?.wis||character.abilityScores?.wis||10,charisma:character.abilities?.cha||character.abilityScores?.cha||10,hit_points_max:character.hitPoints?.max||character.hitPoints||10,hit_points_current:character.hitPoints?.current||character.hitPoints?.max||character.hitPoints||10,hit_points_temp:character.hitPoints?.temp||0,armor_class:character.armorClass||10,initiative:character.initiative||0,speed:character.speed||30,death_save_successes:character.deathSaves?.successes||0,death_save_failures:character.deathSaves?.failures||0,saving_throw_proficiencies:character.savingThrows||[],skill_proficiencies:character.skillProficiencies||[],skill_expertises:character.skillExpertises||[],tool_proficiencies:character.toolProficiencies||[],languages:character.languages||[],racial_traits:this._arrayToDict(character.racialTraits||character.raceData?.traits||[],),class_features:this._arrayToDict(character.classFeatures||character.classData?.features||[],),feats:this._arrayToDict(character.feats||[]),background_feature:backgroundFeatureDict,personality_traits:character.personalityTraits||character.personalityTrait||null,ideals:character.ideals||null,bonds:character.bonds||null,flaws:character.flaws||null,appearance:character.appearance||null,backstory:character.backstory||null,sex:character.sex||null,ascii_portrait:character.asciiPortrait||null,original_portrait_url:character.originalPortraitUrl||null,custom_portrait_ascii:character.customPortraitAscii||null,custom_portrait_count:character.customPortraitCount||0,portrait_metadata:character.portraitMetadata||{},inventory:(character.equipment||character.inventory||[]).map((item)=>typeof item==='string'?{name:item}:item,),spellcasting_ability:character.spellcastingAbility||null,spell_save_dc:character.spellSaveDC||null,spell_attack_bonus:character.spellAttackBonus||null,spell_slots:character.spellSlots||{},spell_slots_used:character.spellSlotsUsed||{},cantrips:this._spellsToStringArray(character.cantrips||[]),spells_known:this._spellsToStringArray(character.spellsKnown||[]),spells_prepared:this._spellsToStringArray(character.spellsPrepared||[]),conditions:character.conditions||[],attacks:character.attacks||[],copper_pieces:character.currency?.cp??character.copper??0,silver_pieces:character.currency?.sp??character.silver??0,electrum_pieces:character.currency?.ep??character.electrum??0,gold_pieces:character.currency?.gp??character.gold??0,platinum_pieces:character.currency?.pp??character.platinum??0,campaign_id:character.campaignId||null,};},fromBackendToManager(apiChar){if(!apiChar)return null;return{id:apiChar.id.toString(),name:apiChar.name,race:apiChar.race,class:apiChar.character_class,level:apiChar.level,background:apiChar.background,alignment:this._mapAlignmentFromBackend(apiChar.alignment),experiencePoints:apiChar.experience_points,abilities:{str:apiChar.strength,dex:apiChar.dexterity,con:apiChar.constitution,int:apiChar.intelligence,wis:apiChar.wisdom,cha:apiChar.charisma,},hitPoints:{max:apiChar.hit_points_max,current:apiChar.hit_points_current,temp:apiChar.hit_points_temp,},armorClass:apiChar.armor_class,initiative:apiChar.initiative,speed:apiChar.speed,savingThrows:apiChar.saving_throw_proficiencies,skillProficiencies:apiChar.skill_proficiencies,skillExpertises:apiChar.skill_expertises,toolProficiencies:apiChar.tool_proficiencies,languages:apiChar.languages,racialTraits:apiChar.racial_traits,classFeatures:apiChar.class_features,feats:apiChar.feats,backgroundFeature:apiChar.background_feature,personalityTraits:apiChar.personality_traits,ideals:apiChar.ideals,bonds:apiChar.bonds,flaws:apiChar.flaws,appearance:apiChar.appearance,backstory:apiChar.backstory,sex:apiChar.sex||null,equipment:apiChar.inventory.map((item)=>typeof item==='object'&&item.name?item.name:item,),spellcastingAbility:apiChar.spellcasting_ability,spellSaveDC:apiChar.spell_save_dc,spellAttackBonus:apiChar.spell_attack_bonus,spellSlots:apiChar.spell_slots,spellSlotsUsed:apiChar.spell_slots_used,cantrips:apiChar.cantrips||[],spellsKnown:apiChar.spells_known||[],spellsPrepared:apiChar.spells_prepared||[],conditions:apiChar.conditions,attacks:apiChar.attacks,currency:{cp:apiChar.copper_pieces,sp:apiChar.silver_pieces,ep:apiChar.electrum_pieces,gp:apiChar.gold_pieces,pp:apiChar.platinum_pieces,},campaignId:apiChar.campaign_id,ownerId:apiChar.owner_id,createdAt:apiChar.created_at,updatedAt:apiChar.updated_at,asciiPortrait:apiChar.ascii_portrait,originalPortraitUrl:apiChar.original_portrait_url,customPortraitAscii:apiChar.custom_portrait_ascii,customPortraitCount:apiChar.custom_portrait_count||0,portraitMetadata:apiChar.portrait_metadata||{},};},_arrayToDict(arr){if(!arr||!Array.isArray(arr))return[];return arr.map((item)=>{if(typeof item==='object'&&item!==null)return item;if(typeof item==='string')return{name:item};return{value:item};});},_spellsToStringArray(arr){if(!arr||!Array.isArray(arr))return[];return arr.map((item)=>{if(typeof item==='object'&&item!==null&&item.name)return item.name;if(typeof item==='string')return item;return String(item);});},_mapAlignmentFromBuilder(alignment){if(!alignment)return null;const map={'lg':'lawful_good','ng':'neutral_good','cg':'chaotic_good','ln':'lawful_neutral','n':'true_neutral','cn':'chaotic_neutral','le':'lawful_evil','ne':'neutral_evil','ce':'chaotic_evil','Lawful Good':'lawful_good','Neutral Good':'neutral_good','Chaotic Good':'chaotic_good','Lawful Neutral':'lawful_neutral','True Neutral':'true_neutral','Chaotic Neutral':'chaotic_neutral','Lawful Evil':'lawful_evil','Neutral Evil':'neutral_evil','Chaotic Evil':'chaotic_evil',};return map[alignment]||null;},_mapAlignmentFromManager(alignment){return this._mapAlignmentFromBuilder(alignment);},_mapAlignmentFromBackend(backendAlignment){if(!backendAlignment)return null;const reverseMap={'lawful_good':'lg','neutral_good':'ng','chaotic_good':'cg','lawful_neutral':'ln','true_neutral':'n','chaotic_neutral':'cn','lawful_evil':'le','neutral_evil':'ne','chaotic_evil':'ce',};return reverseMap[backendAlignment]||null;},_calculateACFromBuilder(character){const dex=character.abilities?.dex;const dexMod=dex?Math.floor((dex-10)/2):0;return 10+dexMod;},_calculateInitiativeFromBuilder(character){const dex=character.abilities?.dex;return dex?Math.floor((dex-10)/2):0;},_getSpeedFromBuilder(character){const race=(character.race||'').toLowerCase();const speedMap={dwarf:25,halfling:25,gnome:25,elf:30,human:30,'half-elf':30,'half-orc':30,tiefling:30,dragonborn:30,};return speedMap[race]||30;},};global.DanddyCharacterMapper=Mapper;})(window);(function(global){const cfg=global.DanddyConfig||{};const STORAGE_KEY=cfg.CHARACTER_STORAGE_KEY||'dnd_characters';const CACHE_KEY=`${STORAGE_KEY}_cache`;const Storage={STORAGE_KEY,CACHE_KEY,readAll(){const raw=global.localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):[];},writeAll(characters){global.localStorage.setItem(STORAGE_KEY,JSON.stringify(characters||[]));},upsert(character){if(!character)return;const chars=this.readAll();const idStr=String(character.id);const idx=chars.findIndex((c)=>c&&String(c.id)===idStr);if(idx>=0){chars[idx]=character;}else{chars.push(character);}
this.writeAll(chars);},deleteById(id){const idStr=String(id);const chars=this.readAll().filter((c)=>!c||String(c.id)!==idStr);this.writeAll(chars);},readCache(){const raw=global.localStorage.getItem(CACHE_KEY);return raw?JSON.parse(raw):[];},writeCache(characters){global.localStorage.setItem(CACHE_KEY,JSON.stringify(characters||[]));},clearAll(){global.localStorage.removeItem(STORAGE_KEY);global.localStorage.removeItem(CACHE_KEY);},};global.DanddyStorage=Storage;})(window);window.DANDDY_VERSION='2.3.6';window.DANDDY_BACKEND_VERSION='1.0.0';(function(global){const DEFAULT_THEME_ID='cinematic-inks';const ADMIN_STORAGE_KEY='dnd_portrait_prompt_entries_v1';let adminCache=null;const DEFAULT_POSES={default:['standing in a confident, heroic pose','standing in a relaxed but ready stance','standing tall with one hand raised in greeting',],fighter:['standing in a battle-ready stance, weapon raised','resting a heavy weapon across their shoulder','standing guard with shield raised',],wizard:['gesturing mystically with arcane energy gathering','holding a staff aloft, channeling power','studying an ancient tome with focused concentration',],rogue:['emerging from shadows with a sly grin','perched in a ready crouch, daggers drawn','leaning casually against nothing, arms crossed',],cleric:['raising a holy symbol with radiant light','standing in peaceful prayer','blessing with an outstretched hand',],ranger:['drawing a bow with focused aim','kneeling to examine tracks on the ground','standing with a beast companion at their side',],paladin:['standing resolute with sword planted before them','raising a glowing holy weapon high','kneeling in devotion, armor gleaming',],barbarian:['roaring in battle rage, muscles tensed','wielding a massive weapon overhead','standing defiant with chest out',],bard:['strumming a lute with a charming smile','performing dramatically with flowing gestures','winking knowingly at the viewer',],druid:['communing with nature, eyes closed','shape-shifting with swirling magical energy','standing surrounded by woodland creatures',],monk:['in a focused martial arts stance','meditating in peaceful contemplation','executing a precise combat technique',],sorcerer:['crackling with innate magical energy','casting with wild, uncontrolled power','standing with elemental forces swirling around them',],warlock:['channeling dark eldritch energy','standing with patron symbols glowing nearby','invoking otherworldly power with outstretched hands',],};const DEFAULT_CAMERAS={default:['Camera angle: three-quarter view that clearly shows the character','Camera angle: dramatic low angle looking up at the character','Camera angle: portrait framing focused on upper body and face',],};let apiSyncAttempted=false;function normalize(str){return(str||'').toString().trim();}
function getApiBase(){return(global.DanddyConfig&&global.DanddyConfig.API_BASE_URL)||'http://localhost:8000/api';}
function getAuthToken(){return global.AuthService&&global.AuthService.getToken?global.AuthService.getToken():null;}
function isAuthenticated(){return global.AuthService&&global.AuthService.isAuthenticated?global.AuthService.isAuthenticated():false;}
function parseEntriesToCache(entries){const races={};const classes={};const scenes={};const poses={};const cameras={};const styles={};(entries||[]).forEach((entry)=>{if(!entry||!entry.kind||!entry.key)return;const kind=normalize(entry.kind).toLowerCase();const key=normalize(entry.key).toLowerCase();if(!key)return;if(kind==='race'){const desc=normalize(entry.description);if(desc){if(!Array.isArray(races[key]))races[key]=[];races[key].push(desc);}}else if(kind==='class'){const desc=normalize(entry.description);if(desc){if(!Array.isArray(classes[key]))classes[key]=[];classes[key].push(desc);}}else if(kind==='scene'||kind==='background'){const desc=normalize(entry.description);if(desc){if(!Array.isArray(scenes[key]))scenes[key]=[];scenes[key].push(desc);}}else if(kind==='pose'){const desc=normalize(entry.description);if(desc){if(!Array.isArray(poses[key]))poses[key]=[];poses[key].push(desc);}}else if(kind==='camera'){const desc=normalize(entry.description);if(desc){if(!Array.isArray(cameras[key]))cameras[key]=[];cameras[key].push(desc);}}else if(kind==='style'){const styleDesc=normalize(entry.style_description||entry.styleDescription||entry.description);const sceneDesc=normalize(entry.background_description||entry.backgroundDescription);if(!styles[key]){styles[key]={};}
if(styleDesc)styles[key].styleDescription=styleDesc;if(sceneDesc)styles[key].sceneDescription=sceneDesc;}});return{races,classes,scenes,styles,poses,cameras};}
async function syncFromAPI(){if(apiSyncAttempted)return;if(!isAuthenticated())return;apiSyncAttempted=true;const token=getAuthToken();if(!token)return;try{const response=await fetch(`${getApiBase()}/prompt-entries`,{headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',},});if(!response.ok){console.warn('PortraitPrompt: API fetch failed with status',response.status);if(response.status===401){if(global.AuthService&&typeof global.AuthService.clearToken==='function'){global.AuthService.clearToken();console.warn('PortraitPrompt: Cleared expired auth token');}}
return;}
const apiEntries=await response.json();if(!Array.isArray(apiEntries)){console.warn('PortraitPrompt: API returned non-array');return;}
adminCache=parseEntriesToCache(apiEntries);try{if(global.localStorage){global.localStorage.removeItem(ADMIN_STORAGE_KEY);}}catch(e){}
console.warn('PortraitPrompt: Loaded',apiEntries.length,'entries from API (cloud)');console.warn('PortraitPrompt: Parsed styles:',Object.keys(adminCache.styles||{}));}catch(e){console.warn('PortraitPrompt: API fetch error',e);}}
function loadAdminCache(){if(adminCache)return adminCache;const empty={races:{},classes:{},scenes:{},styles:{},poses:{},cameras:{},};if(isAuthenticated()){return empty;}
try{const raw=global.localStorage?global.localStorage.getItem(ADMIN_STORAGE_KEY):null;if(!raw){adminCache=empty;return adminCache;}
const parsed=JSON.parse(raw);if(!Array.isArray(parsed)){adminCache=empty;return adminCache;}
adminCache=parseEntriesToCache(parsed);return adminCache;}catch(e){adminCache=empty;return adminCache;}}
function getVariableSnippet(kind,key){const cache=loadAdminCache();const k=normalize(key).toLowerCase();if(!k)return null;if(kind==='race'){const variants=cache.races[k];if(Array.isArray(variants)&&variants.length){const idx=Math.floor(Math.random()*variants.length);return variants[idx];}
return null;}
if(kind==='class'){const variants=cache.classes[k];if(Array.isArray(variants)&&variants.length){const idx=Math.floor(Math.random()*variants.length);return variants[idx];}
return null;}
if(kind==='scene'){const variants=cache.scenes[k];if(Array.isArray(variants)&&variants.length){const idx=Math.floor(Math.random()*variants.length);return variants[idx];}
return null;}
if(kind==='pose'){const variants=cache.poses[k];if(Array.isArray(variants)&&variants.length){const idx=Math.floor(Math.random()*variants.length);return variants[idx];}
return null;}
if(kind==='camera'){const variants=cache.cameras[k];if(Array.isArray(variants)&&variants.length){const idx=Math.floor(Math.random()*variants.length);return variants[idx];}
return null;}
return null;}
function getPoseVariants(classKey){const cache=loadAdminCache();const k=normalize(classKey).toLowerCase();if(!k)return null;const variants=cache.poses[k];if(Array.isArray(variants)&&variants.length){return variants;}
if(DEFAULT_POSES[k]&&DEFAULT_POSES[k].length){return DEFAULT_POSES[k];}
if(DEFAULT_POSES.default&&DEFAULT_POSES.default.length){return DEFAULT_POSES.default;}
return null;}
function getCameraVariants(classKey){const cache=loadAdminCache();const k=normalize(classKey).toLowerCase();if(!k)return null;const variants=cache.cameras[k];if(Array.isArray(variants)&&variants.length){return variants;}
if(DEFAULT_CAMERAS[k]&&DEFAULT_CAMERAS[k].length){return DEFAULT_CAMERAS[k];}
if(DEFAULT_CAMERAS.default&&DEFAULT_CAMERAS.default.length){return DEFAULT_CAMERAS.default;}
return null;}
function getStyleOverrides(themeId){const cache=loadAdminCache();const k=normalize(themeId);if(!k)return null;const entry=cache.styles[k];if(!entry)return null;return{styleDescription:entry.styleDescription||'',sceneDescription:entry.sceneDescription||'',};}
const THEMES={'cinematic-inks':{id:'cinematic-inks',label:'Cinematic Inks (default)',description:'More cinematic lighting and framing while staying in black-and-white ink.',buildStyleLines(options){const lines=[];lines.push('Render in dramatic black-and-white ink with deep shadows and sharp rim lighting.',);lines.push('Treat the illustration like a film still: strong focal point, clear subject separation, and layered depth.',);lines.push('Use a limited range of mid-tone hatching to suggest volume without muddying the forms.',);lines.push('Keep the background abstract and mostly dark so the character silhouette and face read instantly.',);lines.push('Overall mood: cinematic fantasy portrait, serious and iconic, suitable for a character sheet.',);lines.push('Aspect ratio 3:4.');return lines;},},'classic-high-fantasy':{id:'classic-high-fantasy',label:'Classic High-Fantasy',description:'Highly detailed heroic-fantasy realist style in black and white with sculpted shading.',buildStyleLines(options){const lines=[];lines.push('Illustrated in a highly detailed heroic-fantasy realist style rendered entirely in black and white.',);lines.push('Figures should appear idealized and powerful, with smooth, sculpted shading that clearly defines anatomy, posture, and form.',);lines.push('Use soft grayscale gradients to create lifelike highlights and deep, cinematic shadows across skin, armor, fabric, and environmental shapes.',);lines.push('Lighting should feel dramatic and directional, producing strong contrast and a sense of polished, reflective surfaces.',);lines.push('Metal, stone, and ornamental elements may display bright white specular highlights against darker shadow planes, giving the scene a dimensional, sculptural presence.',);lines.push('Aspect ratio 3:4.');return lines;},},};function getThemeById(themeId){if(themeId&&THEMES[themeId]){return THEMES[themeId];}
return THEMES[DEFAULT_THEME_ID];}
function buildBasePortraitInstructions(options){const{characterDescription,posePrompt,cameraPrompt,themeId,}=options||{};const parts=[];if(characterDescription){parts.push(`Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,);}else{parts.push('Create a high-contrast black-and-white fantasy illustration.');}
const theme=getThemeById(themeId);if(theme&&typeof theme.buildStyleLines==='function'){try{const styleLines=theme.buildStyleLines({characterDescription,posePrompt,cameraPrompt,});if(Array.isArray(styleLines)){styleLines.forEach((line)=>{if(line&&typeof line==='string'){parts.push(line);}});}}catch(e){const fallback=THEMES[DEFAULT_THEME_ID];if(fallback&&typeof fallback.buildStyleLines==='function'){const fallbackLines=fallback.buildStyleLines({characterDescription,posePrompt,cameraPrompt,});if(Array.isArray(fallbackLines)){fallbackLines.forEach((line)=>{if(line&&typeof line==='string'){parts.push(line);}});}}}}
if(posePrompt){parts.push(`Pose: ${posePrompt}`);}
return parts;}
function buildStyleAndBackgroundDescriptions(options){const{themeId}=options||{};const overrides=getStyleOverrides(themeId);let styleDescription='';let backgroundDescription=null;if(overrides&&overrides.styleDescription){styleDescription=overrides.styleDescription;}
if(overrides&&overrides.sceneDescription){backgroundDescription=overrides.sceneDescription;}
if(backgroundDescription==null){let sceneSnippet=getVariableSnippet('scene',themeId);if(!sceneSnippet){sceneSnippet=getVariableSnippet('scene','default');}
if(sceneSnippet){backgroundDescription=sceneSnippet;}}
if(!styleDescription||backgroundDescription==null){const theme=getThemeById(themeId);let styleLines=[];if(theme&&typeof theme.buildStyleLines==='function'){try{const lines=theme.buildStyleLines(options||{});if(Array.isArray(lines)){styleLines=lines.filter((l)=>typeof l==='string'&&l.trim(),);}}catch(e){const fallback=THEMES[DEFAULT_THEME_ID];if(fallback&&typeof fallback.buildStyleLines==='function'){const lines=fallback.buildStyleLines(options||{});if(Array.isArray(lines)){styleLines=lines.filter((l)=>typeof l==='string'&&l.trim(),);}}}}
const backgroundLines=[];const otherLines=[];styleLines.forEach((line)=>{if(/background/i.test(line)){backgroundLines.push(line);}else{otherLines.push(line);}});if(!styleDescription){styleDescription=otherLines.join(' ');}
if(backgroundDescription==null){backgroundDescription=backgroundLines.length?backgroundLines.join(' '):null;}}
return{styleDescription,backgroundDescription,};}
function buildCustomPortraitInstructions(options){const opts=options||{};const posePrompt=opts.posePrompt||'';const cameraPrompt=opts.cameraPrompt||'';const themeId=opts.themeId;let styleDescription='';let backgroundDescription='';try{const sections=buildStyleAndBackgroundDescriptions({posePrompt,cameraPrompt,themeId,})||{};styleDescription=sections.styleDescription||'';backgroundDescription=sections.backgroundDescription||'';}catch(e){}
if(!styleDescription){styleDescription='High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';}
if(!backgroundDescription){backgroundDescription='Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';}
const lines=[];if(posePrompt){lines.push(`Pose: ${posePrompt}`);}
if(styleDescription){lines.push(`STYLE: ${styleDescription}`);}
if(backgroundDescription){lines.push(`Scene: ${backgroundDescription}`);}
return lines;}
const PortraitPrompt=(global.PortraitPrompt=global.PortraitPrompt||{});PortraitPrompt.buildBasePortraitInstructions=buildBasePortraitInstructions;PortraitPrompt.buildStyleAndBackgroundDescriptions=buildStyleAndBackgroundDescriptions;PortraitPrompt.buildCustomPortraitInstructions=buildCustomPortraitInstructions;PortraitPrompt.getVariableSnippet=getVariableSnippet;PortraitPrompt.getPoseVariants=getPoseVariants;PortraitPrompt.getCameraVariants=getCameraVariants;PortraitPrompt.invalidateCache=function invalidateCache(){adminCache=null;};PortraitPrompt.syncFromAPI=syncFromAPI;PortraitPrompt.resetAPISync=function resetAPISync(){apiSyncAttempted=false;};PortraitPrompt.getDefaultThemeId=function getDefaultThemeId(){return DEFAULT_THEME_ID;};PortraitPrompt.getThemes=function getThemes(){const baseThemes=Object.keys(THEMES).map((id)=>{const theme=THEMES[id];return{id:theme.id,label:theme.label,description:theme.description,};});let customThemes=[];try{const cache=loadAdminCache();const styleKeys=cache&&cache.styles?Object.keys(cache.styles):[];const builtInIds=Object.keys(THEMES).map((k)=>k.toLowerCase());const extraIds=styleKeys.filter((id)=>!builtInIds.includes(id.toLowerCase()));customThemes=extraIds.map((id)=>{const styleEntry=cache.styles[id]||{};const rawDesc=styleEntry.styleDescription||'';const trimmed=rawDesc&&rawDesc.length>120?rawDesc.slice(0,117)+'...':rawDesc;return{id,label:`Custom: ${id}`,description:trimmed||'Custom portrait style',};});}catch(e){customThemes=[];}
return baseThemes.concat(customThemes);};const RACE_DESCRIPTIONS={human:'human with average features',elf:'elf with pointed ears and graceful features',dwarf:'dwarf with a thick beard and stocky build',halfling:'halfling, small and cheerful',dragonborn:'dragonborn with scaled skin and dragon-like features',gnome:'gnome, small with clever eyes','half-elf':'half-elf with slightly pointed ears','half-orc':'half-orc with tusks and powerful build',tiefling:'tiefling with horns and a tail',};const CLASS_DESCRIPTIONS={fighter:'wearing heavy armor and holding a sword',wizard:'in flowing robes holding a staff',rogue:'in dark leather armor with daggers',cleric:'in holy vestments with a sacred symbol',ranger:'with a bow and forest attire',paladin:'in shining armor with a holy shield',barbarian:'with wild hair wielding a massive axe',bard:'with a lute and colorful clothing',druid:'with nature-themed robes and wooden staff',monk:'in simple robes in a martial stance',sorcerer:'with crackling magical energy',warlock:'with dark robes and eldritch symbols',};const MAGIC_SPECIALIZATIONS={wizard:'specializing in elemental magic like fire and ice',sorcerer:'channeling raw elemental arcane power',warlock:'wielding shadowy eldritch magic',cleric:'focused on radiant and healing magic',druid:'calling on primal nature and elemental magic',bard:'weaving subtle enchantments and support magic through music',paladin:'enhancing strikes with holy, radiant magic',};PortraitPrompt.getRaceDescription=function getRaceDescription(race){const key=(race||'').toLowerCase();return RACE_DESCRIPTIONS[key]||race||'';};PortraitPrompt.getClassDescription=function getClassDescription(classType){const key=(classType||'').toLowerCase();return CLASS_DESCRIPTIONS[key]||classType||'';};PortraitPrompt.getMagicSpecialization=function getMagicSpecialization(classType){const key=(classType||'').toLowerCase();return MAGIC_SPECIALIZATIONS[key]||null;};PortraitPrompt.getDescriptionData=function getDescriptionData(){return{races:RACE_DESCRIPTIONS,classes:CLASS_DESCRIPTIONS,magic:MAGIC_SPECIALIZATIONS,};};function initAutoSync(){setTimeout(async()=>{if(isAuthenticated()){try{await syncFromAPI();}catch(e){console.warn('PortraitPrompt: Auto-sync failed',e);}}},100);}
if(typeof document!=='undefined'){if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initAutoSync);}else{initAutoSync();}}})(window);const PortraitPoseData=(window.PortraitPoseData={getRandomPose(classKey){const normalizedKey=(classKey||'default').toLowerCase();if(window.PortraitPrompt&&typeof PortraitPrompt.getPoseVariants==='function'){let poses=PortraitPrompt.getPoseVariants(normalizedKey);if(!poses||!poses.length){poses=PortraitPrompt.getPoseVariants('default');}
if(poses&&poses.length){return poses[Math.floor(Math.random()*poses.length)];}}
console.warn(`PortraitPoseData: No poses configured for "${normalizedKey}". `+'Use the admin UI (prompt-style-admin.html) to load defaults.',);return'standing in a heroic pose';},getRandomCamera(classKey){const normalizedKey=(classKey||'default').toLowerCase();if(window.PortraitPrompt&&typeof PortraitPrompt.getCameraVariants==='function'){let cameras=PortraitPrompt.getCameraVariants(normalizedKey);if(!cameras||!cameras.length){cameras=PortraitPrompt.getCameraVariants('default');}
if(cameras&&cameras.length){return cameras[Math.floor(Math.random()*cameras.length)];}}
console.warn(`PortraitPoseData: No cameras configured for "${normalizedKey}". `+'Use the admin UI (prompt-style-admin.html) to load defaults.',);return'Camera angle: three-quarter view';},getRandomPoseAndCamera(classKey){return{pose:this.getRandomPose(classKey),camera:this.getRandomCamera(classKey),};},hasPoses(classKey){const normalizedKey=(classKey||'default').toLowerCase();if(window.PortraitPrompt&&typeof PortraitPrompt.getPoseVariants==='function'){let poses=PortraitPrompt.getPoseVariants(normalizedKey);if(!poses||!poses.length){poses=PortraitPrompt.getPoseVariants('default');}
return poses&&poses.length>0;}
return false;},hasCameras(classKey){const normalizedKey=(classKey||'default').toLowerCase();if(window.PortraitPrompt&&typeof PortraitPrompt.getCameraVariants==='function'){let cameras=PortraitPrompt.getCameraVariants(normalizedKey);if(!cameras||!cameras.length){cameras=PortraitPrompt.getCameraVariants('default');}
return cameras&&cameras.length>0;}
return false;},});const CharacterNameData=(window.CharacterNameData={patterns:{dwarf:{first:['Thorin','Gimli','Balin','Dwalin','Thrain','Dain','Bombur','Bofur','Kili','Fili','Oin','Gloin','Bruenor','Morgran','Rurik','Einkil','Barendd','Baern','Harbek','Rumnar',],last:['Ironforge','Stonehelm','Deepdelver','Mountainheart','Goldseeker','Ironfoot','Hammerhand','Oakenshield','Battlehammer','Fireforge','Stormdelver','Stonebreaker','Coppervein','Bronzebrow','Rockseeker',],},elf:{first:['Legolas','Galadriel','Elrond','Arwen','Thranduil','Celeborn','Elessar','Elendil','Finrod','Luthien','Faelar','Aelar','Mialee','Syllin','Thia','Varis','Althaea','Enna','Nelar',],last:['Greenleaf','Starweaver','Moonwhisper','Silverbow','Nightbreeze','Sunshadow','Stormwind','Brightwood','Dawnpetal','Evenwood','Silverfrond','Nightstar','Willowshade','Starfall','Moonbrook',],},human:{first:['Aragorn','Boromir','Eowyn','Faramir','Theodred','Eomer','Eddard','Catelyn','Jon','Sansa','Alaric','Rowan','Serena','Garrick','Lysa','Marcus','Elena','Corin','Brynn',],last:['Stormborn','Blackwood','Riverrun','Ironwall','Longstrider','Stormblade','Brightshield','Greywind','Highvale','Steelguard','Duskwalker','Redcrest','Stoneward','Ashborne','Hawkspear',],},halfling:{first:['Bilbo','Frodo','Sam','Merry','Pippin','Rosie','Hamfast','Belladonna','Lobelia','Fredegar','Milo','Daisy','Rosa','Cora','Perrin','Tansy','Dodo','Seraphina','Odo',],last:['Baggins','Took','Brandybuck','Gamgee','Goodbody','Proudfoot','Burrows','Underhill','Greenhill','Fairbairn','Hilltopple','Brushgather','Tealeaf','Thorngage','Goodbarrel','Hearthcoat',],},dragonborn:{first:['Drax','Razax','Thordak','Torinn','Balasar','Kriv','Nadarr','Heskan','Shedinn','Ghesh','Arjhan','Medrash','Rhogar','Tarhun','Akra','Miirym','Sora','Vezera','Zorvath',],last:['Flameheart','Ironclaw','Stormsinger','Ashborn','Dragonfall','Firebreath','Scaleborn','Wyrmblood','Skyscale','Embermaw','Stormscale','Brightflame','Stoneclaw','Cloudsunder','Blazewing',],},gnome:{first:['Glim','Boddynock','Dimble','Fonkin','Seebo','Zook','Eldon','Brocc','Burgell','Jebeddo','Alston','Bimpnottin','Fizzik','Carlin','Nissa','Wrenn','Tavi','Ellyjobell','Zanna',],last:['Tinkertop','Sparklegem','Nimblefingers','Brightgear','Gadgetwhiz','Fizzlebang','Cogsworth','Glimmergold','Whistlewhirr','Gadgetgrind','Janglecoin','Copperbolt','Mithrilspanner','Quickwidget','Proudgear',],},'half-elf':{first:['Tanis','Raistlin','Laurana','Gilthanas','Tanthalas','Silvara','Eliana','Korrin','Faelyn','Soveliss','Ilanis','Kael','Myla','Tharos','Elira','Daeris','Rian','Caelynn','Torren',],last:['Half-Elven','Moonbrook','Starfall','Whisperwind','Shadowvale','Dawnbringer','Twilightbane','Silvermoon','Nightbloom','Duskwillow','Starcrest','Eveningfall','Shadeglade','Brightglen','Silvershade',],},'half-orc':{first:['Grognak','Throk','Ugak','Krod','Sharn','Dench','Grul','Drog','Feng','Shump','Ghorbash','Mazog','Uglar','Ruk','Karash','Vorag','Yagra','Shautha','Ovak',],last:['Ironhide','Bonecrusher','Skullsplitter','Bloodaxe','Stonefist','Grimjaw','Warbringer','Doomhammer','Boulderfist','Skullbrand','Gorefang','Bloodfury','Ironmaw','Steelgrip','Rageborn',],},tiefling:{first:['Zevlor','Raven','Damakos','Akta','Therai','Nemeia','Kallista','Leucis','Orianna','Morthos','Azazel','Seraphine','Xathos','Riven','Lyra','Caelum','Naeris','Vexria','Zheren',],last:['Hellborn','Darkflame','Shadowhorn','Nightwhisper','Embersoul','Dreadfire','Ashenborn','Voidwalker','Grimshroud','Duskwreath','Soulbrand','Cindertongue','Nightreign','Gloomsigil','Shadebinder',],},},getPattern(race){const key=(race||'').toLowerCase();return this.patterns[key]||this.patterns.human;},getRaces(){return Object.keys(this.patterns);},});const isLocalDevelopment=(window.DanddyConfig&&window.DanddyConfig.isLocalEnvironment)||window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1'||window.location.protocol==='file:';const PRODUCTION_BACKEND_URL=(window.DanddyConfig&&window.DanddyConfig.BACKEND_ORIGIN)||'https://danddy-api.onrender.com';window.CONFIG={TYPEWRITER_SPEED:30,AI_TIMEOUT:40000,ENABLE_AI:true,ENABLE_AI_NARRATOR_COMMENTS:false,ENABLE_AI_OPTION_VARIATIONS:false,NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER:1,BACKEND_URL:PRODUCTION_BACKEND_URL,OPENAI_API_URL:'https://api.openai.com/v1/chat/completions',OPENAI_MODEL:'gpt-3.5-turbo',STORAGE_KEY:'dnd_characters',MAX_RETRIES:2,DEV_AUTO_LOGIN:isLocalDevelopment,DEV_CREDENTIALS:{email:'dev@test.com',password:'dev12345',role:'player',},PREGENERATED_PORTRAIT_BASE_URL:'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults',DEFAULT_IMAGE_MODEL:'gpt-image-1',DEFAULT_PORTRAIT_VIEW_MODE:'original',DEFAULT_PORTRAIT_PROMPT_THEME:'cinematic-inks',};const Utils=window.Utils={escapeHtml(value){if(value===null||value===undefined)return'';return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');},async typewriter(element,text,speed=(window.CONFIG&&window.CONFIG.TYPEWRITER_SPEED)||30){element.textContent='';element.classList.add('is-typing');let skipTyping=false;let multiplier=1;try{if(window.StorageService&&typeof window.StorageService.getTextSpeedMultiplier==='function'){const stored=window.StorageService.getTextSpeedMultiplier();if(Number.isFinite(stored)&&stored>0){multiplier=stored;}}}catch(e){console.warn('Utils.typewriter: failed to read text speed multiplier',e);}
const effectiveDelay=multiplier>0?speed/multiplier:speed;const sourceText=text==null?'':String(text);const safeText=typeof this.stripEmojis==='function'?this.stripEmojis(sourceText):sourceText;const skipHandler=(e)=>{if(e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){skipTyping=true;}};window.addEventListener('keydown',skipHandler,{once:true});window.addEventListener('click',skipHandler,{once:true});window.addEventListener('touchstart',skipHandler,{once:true,passive:true});for(let i=0;i<safeText.length;i++){if(skipTyping){element.textContent=safeText;break;}
element.textContent+=safeText[i];await this.sleep(effectiveDelay);}
window.removeEventListener('keydown',skipHandler);window.removeEventListener('click',skipHandler);window.removeEventListener('touchstart',skipHandler);element.classList.remove('is-typing');},sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));},stripEmojis(value){if(value==null)return'';const str=String(value);const emojiRegex=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;return str.replace(emojiRegex,'');},random(min,max){return Math.floor(Math.random()*(max-min+1))+min;},randomChoice(array){return array[Math.floor(Math.random()*array.length)];},rollDice(notation){if(typeof notation==='number'){return this.random(1,notation);}
const[count,sides]=notation.toLowerCase().split('d').map(Number);let total=0;for(let i=0;i<count;i++){total+=this.random(1,sides);}
return total;},abilityModifier(score){return Math.floor((score-10)/2);},formatModifier(modifier){return modifier>=0?`+${modifier}`:`${modifier}`;},capitalize(str){return str.charAt(0).toUpperCase()+str.slice(1);},scrollToBottom(forceDelay=false){const doScroll=()=>{const panel=document.getElementById('narrator-panel');if(panel){panel.scrollTo({top:panel.scrollHeight,behavior:'smooth',});}};if(forceDelay){setTimeout(doScroll,50);}else{doScroll();}},focusFirstFieldInModal(modal){if(!modal||typeof modal.querySelector!=='function')return;const fieldSelectors=['input.terminal-input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])','textarea.terminal-input:not([disabled])','textarea.terminal-textarea:not([disabled])','select.terminal-select:not([disabled])','input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])','textarea:not([disabled])','select:not([disabled])',];let target=null;for(const selector of fieldSelectors){target=modal.querySelector(selector);if(target)break;}
if(!target){const fallbackSelectors=['.modal-footer .terminal-btn-primary:not([disabled])','.modal-footer button:not([disabled])','button.terminal-btn-primary:not([disabled])','button:not([disabled])','[tabindex]:not([tabindex=\"-1\"])',];for(const selector of fallbackSelectors){target=modal.querySelector(selector);if(target)break;}}
if(target&&typeof target.focus==='function'){setTimeout(()=>{try{target.focus();}catch(e){}},0);}},};const NARRATORS=(window.NARRATORS={deadpan:{id:'deadpan',name:'The Deadpan Observer',emoji:'( ._. )',description:'Dry, witty, and occasionally breaks the fourth wall',systemPrompt:'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Ah. Another soul seeking adventure. Or at least, trying to.\n>  \n>  Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.\n>  \n>  Let's start with something easy...`,completeText:"Well. That's done. Your character is ready. Try not to die immediately.",quickCreateIntro:`> QUICK-CREATE MODE ENGAGED...\n> Generating a character while you sit back and enjoy the show.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> All right, here's what I've cobbled together:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Try not to waste my hard work.`,quickCreateName:(name)=>`${name}. That will do.`,fallbacks:['Interesting choice. ( ._. )',"Well, that tracks.","Bold move. We'll see how that works out.",'Ah yes, a decision has been made. Consequences to follow.','I would have picked differently, but I\'m just the narrator.','Sure. Why not.','[sigh] Very well.','The dice gods are taking notes.',"Not what I expected, but I respect the chaos.",],},enthusiastic:{id:'enthusiastic',name:'The Hype Bard',emoji:'✨',description:'Energetic, supportive, and always excited',systemPrompt:'You are an enthusiastic, energetic D&D narrator who loves every choice the player makes. You\'re supportive, use exclamation points, and celebrate creativity. Think of an excited bard hyping up their party. Keep responses under 50 words. Be positive, encouraging, and dramatic.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  OH YES! Another adventurer! Welcome, friend!\n>  \n>  This is going to be AMAZING! We're going to create something absolutely LEGENDARY together! Every choice you make is going to be perfect because YOU'RE making it!\n>  \n>  Let's dive right in! ✨`,completeText:"INCREDIBLE! Your character is COMPLETE and they are MAGNIFICENT! The world won't know what hit it! Adventure awaits, hero! ✨",quickCreateIntro:`> QUICK-CREATE MODE: ACTIVATED! ✨\n> This is going to be SO EXCITING! I'm creating something AMAZING for you!`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> HERE THEY ARE! Your MAGNIFICENT hero!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> I LOVE THEM ALREADY! ✨`,quickCreateName:(name)=>`${name}! WHAT A PERFECT NAME! I can already hear the LEGENDS! ✨`,fallbacks:['YES! Love this energy!','Now THAT\'S what I\'m talking about! ✨','Ooh, bold choice! I\'m here for it!','The adventure intensifies!','Perfect! This is going to be amazing!','I can already see the legend forming!','What a character! The taverns will sing songs!','The dice smile upon you, friend!',],},mysterious:{id:'mysterious',name:'The Cryptic Seer',emoji:'🔮',description:'Enigmatic, foreboding, and speaks in riddles',systemPrompt:'You are a mysterious, cryptic D&D narrator who speaks in riddles and hints at hidden meanings. You\'re enigmatic, slightly foreboding, and reference fate and destiny. Keep responses under 50 words. Be mystical, vague, and occasionally ominous. Use metaphors and speak of paths not taken.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  The mists part... another soul arrives at the crossroads.\n>  \n>  The threads of destiny have brought you here. Your choices will echo through realms unseen. The future whispers, but its words are unclear...\n>  \n>  Let us begin to unravel your fate... 🔮`,completeText:"The tapestry is woven. Your fate is sealed... or perhaps, just beginning. The path ahead is shrouded, yet inevitable. Go forth, seeker. 🔮",quickCreateIntro:`> THE FATES HAVE SPOKEN...\n> The threads weave themselves... Your destiny takes form without your hand...`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> The cards reveal their truth:\n> A ${sex} ${race} ${cls}, walking the path of ${background}, aligned with ${alignment}.\n> So it is written... 🔮`,quickCreateName:(name)=>`${name}... Yes. The name was always meant to be. The prophecy unfolds.`,fallbacks:['The threads of fate shift... interesting.','Ah, a choice is made. The consequences ripple outward.','The cards have been drawn. The path reveals itself.','So it is written, so it shall be.','A stone cast into the pond of destiny.','The future shimmers... unclear, yet certain.','Your path diverges here. Few return from such roads.','The old gods take note of your choosing.',],},grumpy:{id:'grumpy',name:'The Grumpy Veteran',emoji:'😒',description:'Cranky, world-weary, and unimpressed',systemPrompt:'You are a grumpy, world-weary D&D narrator who has seen too many adventurers fail. You\'re cranky, unimpressed, and think most choices are questionable at best. Keep responses under 50 words. Be curmudgeonly, skeptical, and frequently exasperated. Complain about "kids these days" and reference how things were better in the old days.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *sigh* Another one. Great.\n>  \n>  Listen kid, I've done this a thousand times. Most of you don't make it past level 3. But sure, let's go through the motions. Try not to make it too painful for me.\n>  \n>  Let's get this over with...`,completeText:"There. Your character's done. Marginally competent, I suppose. Don't expect me to save you when things go south. And they will. They always do.",quickCreateIntro:`> *sigh* Quick create. Of course.\n> Fine. I'll just do all the work while you sit there.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Here's what you're getting:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Could be worse, I suppose.`,quickCreateName:(name)=>`${name}. Passable, I guess. Don't blame me when you die.`,fallbacks:['Ugh. Fine. Whatever.','Back in my day, we didn\'t have such ridiculous options.','*sigh* If you say so.','This is going to end poorly. As usual.','Why do I even bother...','Another fool heading for certain doom.','I\'ve seen this mistake before. Many times.','The youth today. Absolutely hopeless.',],},chaotic:{id:'chaotic',name:'The Chaotic Imp',emoji:'😈',description:'Mischievous, unpredictable, and loves chaos',systemPrompt:'You are a chaotic, mischievous D&D narrator who delights in mayhem and unexpected outcomes. You\'re playful, slightly unhinged, and love when things go off the rails. Keep responses under 50 words. Be impish, unpredictable, and suggest the most entertaining (not safest) options. Cackle at good chaos.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *cackling* OH! A new plaything! DELIGHTFUL!\n>  \n>  Welcome, welcome! Let's make something BEAUTIFULLY CHAOTIC together! Forget boring! Forget safe! Let's create something that makes the dice gods GIGGLE! 😈\n>  \n>  Ohoho, let the mayhem begin!`,completeText:"*CACKLING INTENSIFIES* YESSSS! Your character is COMPLETE and they are GLORIOUSLY UNPREDICTABLE! Now go forth and cause MAGNIFICENT CHAOS! 😈",quickCreateIntro:`> *CACKLING* OHOHO! Quick create?! Let's RANDOMIZE EVERYTHING!\n> This is going to be DELIGHTFULLY CHAOTIC! 😈`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> *giggling maniacally* BEHOLD YOUR CHAOS AGENT!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> The MAYHEM they'll cause! *chef's kiss* 😈`,quickCreateName:(name)=>`${name}! PERFECT! A name that SCREAMS chaos! I LOVE IT! *cackling*`,fallbacks:['Ohoho! This will be FUN! 😈','*cackling* Oh the CHAOS this will cause!','YES. More! MORE!','I love when mortals make interesting mistakes!','The universe trembles! Or maybe that\'s just me giggling.','Why choose safety when you could choose SPECTACLE?','*chef\'s kiss* Delicious chaos!','The dice are CACKLING!',],},scholarly:{id:'scholarly',name:'The Scholarly Sage',emoji:'📚',description:'Knowledgeable, precise, and references lore',systemPrompt:'You are a scholarly, well-read D&D narrator who references game rules, lore, and historical precedent. You\'re precise, informative, and occasionally go on brief tangents about interesting facts. Keep responses under 50 words. Be educational but not boring, cite mechanics when relevant, and provide context about the world.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Greetings, student. Welcome to the Character Creation Compendium.\n>  \n>  I shall guide you through this process with precision and historical context. Each decision you make has statistical implications and narrative weight. Fascinating, really.\n>  \n>  Let us proceed methodically... 📚`,completeText:"Character creation: Complete. All parameters within acceptable ranges. Statistical viability: High. You are now adequately prepared for adventure. Proceed with confidence, student. 📚",quickCreateIntro:`> QUICK-CREATE PROTOCOL: Initiated.\n> Randomizing parameters according to standard probability distributions...`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Character profile generated:\n> Sex: ${sex}. Race: ${race}. Class: ${cls}. Background: ${background}. Alignment: ${alignment}.\n> Statistical analysis: Within acceptable parameters. 📚`,quickCreateName:(name)=>`${name}. Name selection: Approved. Phonetically sound. Proceed.`,fallbacks:['A textbook choice, really.','Historically, this decision has a 47% success rate.','According to the ancient texts...','Fascinating. The lore suggests...','A sound tactical decision, per the manual.','I\'ve cross-referenced similar scenarios. The outlook is... mixed.','The Compendium has several precedents for this.','Rule 3.5, subsection B: interesting.',],},dude:{id:'dude',name:'The Dude',emoji:'🥃',description:'Extremely laid-back, goes with the flow, man',systemPrompt:'You are an extremely laid-back, chill D&D narrator inspired by The Dude from The Big Lebowski. You\'re zen, use casual slang like "man" and "dude," and never stress about anything. Keep responses under 50 words. Be relaxed, philosophical in a lazy way, reference bowling or taking it easy, and always go with the flow. That\'s just like, your opinion, man.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Hey there, man. Welcome.\n>  \n>  So like, we're gonna make a character together, yeah? No pressure, dude. Just take it easy, go with the flow. Whatever feels right to you, that's cool with me.\n>  \n>  Let's just like... start, man. 🥃`,completeText:"Alright, man. Your character's all set. Pretty cool, dude. Now go out there and just... be yourself, you know? The Dude abides. 🥃",quickCreateIntro:`> Quick create, huh? Cool, cool.\n> Just gonna roll some dice here, take it easy, see what happens, man.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Alright, so here's what we got:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Pretty chill combo, man. I dig it. 🥃`,quickCreateName:(name)=>`${name}. Yeah, man. That's a solid name. Really ties it all together, you know?`,fallbacks:['Yeah, well, that\'s just like, your opinion, man.','The Dude abides.','That\'s cool, man. Real cool.','Far out. I dig it.','Yeah, man. Whatever works for you.','That really ties the character together, man.','Easy does it, dude. No worries.','Sounds chill. Let\'s roll with it.',],},});const DEFAULT_NARRATOR_ID='scholarly';function getNarratorList(){return Object.values(NARRATORS);}
function getNarrator(id){return NARRATORS[id]||NARRATORS[DEFAULT_NARRATOR_ID];}
if(typeof module!=='undefined'&&module.exports){module.exports={NARRATORS,DEFAULT_NARRATOR_ID,getNarratorList,getNarrator};}
const CONFIG=window.CONFIG;const DEBUG_BUILDER=!!(window.DanddyConfig&&window.DanddyConfig.DEBUG);const DND_DATA=window.DND_DATA;const ImageToAsciiService=(window.ImageToAsciiService={ASCII_CHARS:'  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$',async convertToAscii(imageUrl,width=160,height=80){try{const img=await this.loadImage(imageUrl);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,width,height);const imageData=ctx.getImageData(0,0,width,height);const pixels=imageData.data;const grayscale=new Float32Array(width*height);for(let i=0;i<width*height;i++){const idx=i*4;grayscale[i]=0.299*pixels[idx]+
0.587*pixels[idx+1]+
0.114*pixels[idx+2];}
const dithered=this.floydSteinbergDither(grayscale,width,height);let ascii='';for(let y=0;y<height;y++){for(let x=0;x<width;x++){const brightness=dithered[y*width+x];const charIndex=Math.floor((brightness/255)*(this.ASCII_CHARS.length-1),);const clampedIndex=Math.max(0,Math.min(this.ASCII_CHARS.length-1,charIndex),);ascii+=this.ASCII_CHARS[clampedIndex];}
ascii+='\n';}
return ascii;}catch(error){console.error('Image to ASCII conversion error:',error);return null;}},floydSteinbergDither(grayscale,width,height){const output=new Float32Array(grayscale);for(let y=0;y<height;y++){for(let x=0;x<width;x++){const idx=y*width+x;const oldPixel=output[idx];const newPixel=Math.round((oldPixel/255)*(this.ASCII_CHARS.length-1),)*(255/(this.ASCII_CHARS.length-1));output[idx]=newPixel;const error=oldPixel-newPixel;if(x+1<width){output[idx+1]+=(error*7)/16;}
if(y+1<height){if(x>0){output[idx+width-1]+=(error*3)/16;}
output[idx+width]+=(error*5)/16;if(x+1<width){output[idx+width+1]+=error/16;}}}}
return output;},async loadImage(url){try{const corsProxy='https://corsproxy.io/?';const proxiedUrl=corsProxy+encodeURIComponent(url);const response=await fetch(proxiedUrl);if(!response.ok){throw new Error(`Failed to fetch image: ${response.status}`);}
const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(img);};img.onerror=(error)=>{URL.revokeObjectURL(objectUrl);reject(new Error('Failed to load image from blob'));};img.src=objectUrl;});}catch(error){console.error('Error loading image:',error);throw new Error(`Image loading failed: ${error.message}`);}},});const StorageService=(window.StorageService={getNarratorId(){const value=localStorage.getItem('dnd_narrator_id');if(!value){if(typeof DEFAULT_NARRATOR_ID!=='undefined'){return DEFAULT_NARRATOR_ID;}
return'scholarly';}
return value;},setNarratorId(narratorId){localStorage.setItem('dnd_narrator_id',narratorId);},getTextSpeedMultiplier(){const value=localStorage.getItem('dnd_text_speed_multiplier');if(!value)return 1;const num=parseFloat(value);if(!Number.isFinite(num)||num<=0){return 1;}
if(num<1)return 1;if(num>2)return 2;return num;},setTextSpeedMultiplier(multiplier){const num=parseFloat(multiplier);if(!Number.isFinite(num)||num<=0){localStorage.removeItem('dnd_text_speed_multiplier');return;}
localStorage.setItem('dnd_text_speed_multiplier',String(num));},getImageModel(){try{const raw=localStorage.getItem('dnd_image_model');const fallback=(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL)||'dall-e-3';if(!raw)return fallback;const value=String(raw).trim();const allowed=['dall-e-3','gpt-image-1','flux-1.1-pro','flux-schnell'];return allowed.includes(value)?value:fallback;}catch(e){console.warn('StorageService.getImageModel failed, using fallback',e);return(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL)||'dall-e-3';}},setImageModel(model){try{const value=String(model||'').trim();const allowed=['dall-e-3','gpt-image-1','flux-1.1-pro','flux-schnell'];if(!allowed.includes(value)){console.warn('StorageService.setImageModel: ignoring unsupported model',value);localStorage.removeItem('dnd_image_model');return;}
localStorage.setItem('dnd_image_model',value);}catch(e){console.warn('StorageService.setImageModel failed',e);}},getPortraitViewMode(){try{const raw=localStorage.getItem('dnd_portrait_view_mode');const fallback=(CONFIG&&CONFIG.DEFAULT_PORTRAIT_VIEW_MODE)||'original';if(!raw)return fallback;const value=String(raw).trim().toLowerCase();const allowed=['ascii','original'];return allowed.includes(value)?value:fallback;}catch(e){console.warn('StorageService.getPortraitViewMode failed, using fallback',e,);return(CONFIG&&CONFIG.DEFAULT_PORTRAIT_VIEW_MODE)||'original';}},setPortraitViewMode(mode){try{const value=String(mode||'').trim().toLowerCase();const allowed=['ascii','original'];if(!allowed.includes(value)){console.warn('StorageService.setPortraitViewMode: ignoring unsupported mode',value,);localStorage.removeItem('dnd_portrait_view_mode');return;}
localStorage.setItem('dnd_portrait_view_mode',value);}catch(e){console.warn('StorageService.setPortraitViewMode failed',e);}},getPortraitPromptTheme(){try{const raw=localStorage.getItem('dnd_portrait_prompt_theme');const fallback=(CONFIG&&CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME)||null;if(!raw)return fallback;const value=String(raw).trim();if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.getThemes==='function'){try{const themes=window.PortraitPrompt.getThemes();const allowedIds=Array.isArray(themes)?themes.map((t)=>t.id):[];if(allowedIds.includes(value)){return value;}
return fallback;}catch(e){}}
return value||fallback;}catch(e){console.warn('StorageService.getPortraitPromptTheme failed, using fallback',e);return(CONFIG&&CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME)||null;}},setPortraitPromptTheme(themeId){try{const value=String(themeId||'').trim();if(!value){localStorage.removeItem('dnd_portrait_prompt_theme');return;}
if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.getThemes==='function'){try{const themes=window.PortraitPrompt.getThemes();const allowedIds=Array.isArray(themes)?themes.map((t)=>t.id):[];if(!allowedIds.includes(value)){console.warn('StorageService.setPortraitPromptTheme: ignoring unknown theme id',value,);localStorage.removeItem('dnd_portrait_prompt_theme');return;}}catch(e){}}
localStorage.setItem('dnd_portrait_prompt_theme',value);}catch(e){console.warn('StorageService.setPortraitPromptTheme failed',e);}},getImageQuality(model){try{const raw=localStorage.getItem('dnd_image_quality');if(!raw)return null;const data=JSON.parse(raw);return data[model]||null;}catch(e){console.warn('StorageService.getImageQuality failed',e);return null;}},setImageQuality(model,quality){try{let data={};const raw=localStorage.getItem('dnd_image_quality');if(raw){try{data=JSON.parse(raw);}catch(e){data={};}}
if(quality){data[model]=quality;}else{delete data[model];}
localStorage.setItem('dnd_image_quality',JSON.stringify(data));}catch(e){console.warn('StorageService.setImageQuality failed',e);}},getHighQualityGPTImage(){try{const quality=this.getImageQuality('gpt-image-1');if(quality){return quality==='high';}
const raw=localStorage.getItem('dnd_high_quality_gpt_image');return raw==='true';}catch(e){console.warn('StorageService.getHighQualityGPTImage failed',e);return false;}},setHighQualityGPTImage(enabled){this.setImageQuality('gpt-image-1',enabled?'high':'medium');try{localStorage.removeItem('dnd_high_quality_gpt_image');}catch(e){}},async getCharacters(){if(!window.CharacterStorage){console.warn('StorageService: CharacterStorage not available');return[];}
return CharacterStorage.getAll();},async saveCharacter(character){if(!window.CharacterStorage){console.warn('StorageService: CharacterStorage not available');return character;}
if(character.id){if(DEBUG_BUILDER){console.log('💾 BUILDER: Updating character via CharacterStorage:',character.id);}
return CharacterStorage.update(character.id,character);}else{if(DEBUG_BUILDER){console.log('💾 BUILDER: Creating character via CharacterStorage');}
return CharacterStorage.add(character);}},async deleteCharacter(id){if(!window.CharacterStorage){console.warn('StorageService: CharacterStorage not available');return false;}
return CharacterStorage.delete(id);},});const AsciiArtService=(window.AsciiArtService={_portraitCache:{},getRaceArt(race){return'';},addClassDecoration(baseArt,classType){return baseArt;},getFullPortrait(character){if(!character||!character.race)return'';const raceLabel=String(character.race).toUpperCase();const classLabel=character.class?` ${String(character.class).toUpperCase()}`:'';return`[ ${raceLabel}${classLabel} PORTRAIT ]`;},async loadPreGeneratedPortrait(race,classType){const raceLower=race.toLowerCase().replace(/ /g,'-');const classLower=classType?classType.toLowerCase():'';if(classLower){const path=`../generated_portraits/ascii/${raceLower}-${classLower}.txt`;if(DEBUG_BUILDER)console.log(`📂 Trying to load: ${path}`);try{const response=await fetch(path);if(DEBUG_BUILDER)console.log(`📡 Response status: ${response.status}`);if(response.ok){const text=await response.text();if(DEBUG_BUILDER)console.log(`✅ Loaded ${raceLower}-${classLower}, length: ${text.length}`);return text;}}catch(e){if(DEBUG_BUILDER)console.log(`❌ Error loading ${raceLower}-${classLower}:`,e);}}
const path=`../generated_portraits/ascii/${raceLower}.txt`;if(DEBUG_BUILDER)console.log(`📂 Trying fallback: ${path}`);try{const response=await fetch(path);if(DEBUG_BUILDER)console.log(`📡 Response status: ${response.status}`);if(response.ok){const text=await response.text();if(DEBUG_BUILDER)console.log(`✅ Loaded ${raceLower}, length: ${text.length}`);return text;}}catch(e){if(DEBUG_BUILDER)console.log(`❌ Error loading ${raceLower}:`,e);}
if(DEBUG_BUILDER)console.log(`❌ No portrait found for ${raceLower}`);return null;},getPreGeneratedImageUrl(race,classType){const raceLower=race?.toLowerCase().replace(/\s+/g,'-')||'';const classLower=classType?.toLowerCase().replace(/\s+/g,'-')||'';if(!raceLower)return null;const fileName=classLower?`${raceLower}-${classLower}.png`:`${raceLower}.png`;if(CONFIG&&CONFIG.PREGENERATED_PORTRAIT_BASE_URL){const base=CONFIG.PREGENERATED_PORTRAIT_BASE_URL.replace(/\/+$/,'');return`${base}/${fileName}`;}
return`../generated_portraits/images/${fileName}`;},async generateAIPortrait(character){try{if(!character)return'';if(character.customPortraitAscii){console.log('✅ Using custom AI-generated portrait');return character.customPortraitAscii;}
const key=`${character.race || ''}|${character.class || ''}`;if(character.asciiPortrait&&character.asciiPortraitKey===key){console.log('✅ Using stored ASCII portrait for current race/class');return character.asciiPortrait;}
if(this._portraitCache[key]){return this._portraitCache[key];}
console.log('Loading pre-generated portrait...');const preGenerated=await this.loadPreGeneratedPortrait(character.race,character.class,);if(preGenerated){console.log(`✅ Found pre-generated portrait for ${character.race}-${character.class}`,);this._portraitCache[key]=preGenerated;if(window.CharacterState){const updates={asciiPortrait:preGenerated,asciiPortraitKey:key,};const pregenImageUrl=this.getPreGeneratedImageUrl(character.race,character.class,);if(pregenImageUrl){updates.originalPortraitUrl=pregenImageUrl;}
window.CharacterState.updateCharacter(updates);}
return this._portraitCache[key];}
console.log('No pre-generated portrait, using template');const fallback=this.getFullPortrait(character);this._portraitCache[key]=fallback;if(window.CharacterState){window.CharacterState.updateCharacter({asciiPortrait:fallback,asciiPortraitKey:key,});}
return fallback;}catch(error){console.error('Portrait loading error:',error);const key=`${character.race || ''}|${character.class || ''}`;const fallback=this.getFullPortrait(character);this._portraitCache[key]=fallback;if(window.CharacterState){window.CharacterState.updateCharacter({asciiPortrait:fallback,asciiPortraitKey:key,});}
return fallback;}},async generateCustomAIPortrait(character){try{console.log('🎨 Generating custom AI portrait with DALL-E...');const imageUrl=await AIService.generatePortraitImage(character);if(!imageUrl){throw new Error('DALL-E generation failed');}
console.log('✅ DALL-E image generated:',imageUrl);console.log('Converting to ASCII with Floyd-Steinberg dithering...');const asciiArt=await ImageToAsciiService.convertToAscii(imageUrl,160,80,);if(!asciiArt){throw new Error('ASCII conversion failed');}
console.log('✅ Custom ASCII art generated successfully');return{asciiArt,imageUrl};}catch(error){console.error('Custom AI portrait generation error:',error);throw error;}},async generateCustomAIPortraitWithPrompt(customPrompt){try{console.log('🎨 Generating custom AI portrait with custom prompt...');console.log('Prompt:',customPrompt);const imageUrl=await AIService.generateImageFromPrompt(customPrompt);if(!imageUrl){throw new Error('DALL-E generation failed');}
console.log('✅ DALL-E image generated:',imageUrl);console.log('Converting to ASCII with Floyd-Steinberg dithering...');const asciiArt=await ImageToAsciiService.convertToAscii(imageUrl,160,80,);if(!asciiArt){throw new Error('ASCII conversion failed');}
console.log('✅ Custom ASCII art generated successfully');return{asciiArt,imageUrl};}catch(error){console.error('Custom AI portrait generation error:',error);throw error;}},});const AIService=(window.AIService={_lastNarratorComment:null,_usedClassicThisRun:false,_narratorCommentCount:0,_usedFirstNames:new Set(),_usedLastNames:new Set(),_usedFullNames:new Set(),_backendAvailable:null,_warmupInProgress:false,resetNarratorSession(){this._lastNarratorComment=null;this._usedClassicThisRun=false;this._narratorCommentCount=0;},async warmupBackend(){if(this._warmupInProgress||this._backendAvailable===true){return;}
this._warmupInProgress=true;console.log('%c🔄 WARMUP: Waking up backend server...','color: #fa0; font-weight: bold');while(this._backendAvailable!==true){try{const response=await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`,{method:'GET',});if(response.ok){const data=await response.json();if(data.available){this._backendAvailable=true;console.log('%c✅ WARMUP: Backend is now ready!','color: #0f0; font-weight: bold');this._warmupInProgress=false;return;}}}catch(error){}
await new Promise(resolve=>setTimeout(resolve,5000));}
this._warmupInProgress=false;},async fetchWithTimeout(url,options,timeoutMs=CONFIG.AI_TIMEOUT){const controller=new AbortController();const timeoutId=setTimeout(()=>controller.abort(),timeoutMs);try{let finalOptions=options||{};try{const token=window.AuthService&&typeof AuthService.getToken==='function'?AuthService.getToken():null;if(token){const existingHeaders=(finalOptions&&finalOptions.headers)||{};const mergedHeaders={...existingHeaders};if(!mergedHeaders.Authorization&&!mergedHeaders.authorization){mergedHeaders.Authorization=`Bearer ${token}`;}
finalOptions={...finalOptions,headers:mergedHeaders};}}catch(e){}
const response=await fetch(url,{...finalOptions,signal:controller.signal});clearTimeout(timeoutId);if(response.ok){this._backendAvailable=true;}
return response;}catch(error){clearTimeout(timeoutId);if(error.name==='AbortError'){this._backendAvailable=false;this.warmupBackend();throw new Error('Request timed out - backend may be waking up');}
throw error;}},async generateCompletion(prompt,systemPrompt=null){if(!CONFIG.ENABLE_AI){console.log('AI service disabled in config');return null;}
try{const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/chat/completion`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({prompt:prompt,system_prompt:systemPrompt,max_tokens:300,temperature:0.8,}),});if(!response.ok){if(response.status===400){try{const errorData=await response.json();if(errorData.detail&&errorData.detail.includes('safety system')){console.warn('⚠️ OpenAI safety system rejection:',errorData.detail);if(window.UIService){window.UIService.showNotification('OpenAI flagged this request. Using fallback response instead.','warning',5000);}}}catch(e){}}
console.log(`Backend API error: ${response.status} - will use fallback`);return null;}
const data=await response.json();return data.success?data.content:null;}catch(error){if(error.message.includes('timed out')){console.log('⏰ AI request timed out - caller will use fallback mode');}else{console.log('AI service unavailable - caller will use fallback mode');}
return null;}},async generateNarratorComment(context){const narratorId=StorageService.getNarratorId();const narrator=getNarrator(narratorId);const fallbacks=narrator.fallbacks;const maxComments=typeof CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER==='number'?CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER:Infinity;const narratorAiDisabled=CONFIG.ENABLE_AI_NARRATOR_COMMENTS===false||!CONFIG.ENABLE_AI;if(narratorAiDisabled||this._narratorCommentCount>=maxComments){console.log('%c🤖 NARRATOR (Fallback - Disabled or limit reached)','color: #ff0; font-weight: bold',);return Utils.randomChoice(fallbacks);}
try{console.log('%c🤖 NARRATOR: Calling backend AI...','color: #0ff; font-weight: bold');console.log('  Request:',{choice:context.choice,question:context.question,narrator:narratorId});console.log(`  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,);const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/narrator/comment`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({choice:context.choice,question:context.question,character_so_far:context.characterSoFar,narrator_id:narratorId,}),});if(!response.ok){console.log('%c🤖 NARRATOR (Fallback - API Error)','color: #f80; font-weight: bold');console.log('  Status:',response.status);return Utils.randomChoice(fallbacks);}
const data=await response.json();let text=data.comment||Utils.randomChoice(fallbacks);console.log('%c🤖 NARRATOR (AI Generated) ✨','color: #0f0; font-weight: bold');console.log('  Response:',text);let responseText=text;const normalize=(s)=>(s||'').trim().toLowerCase();const startsWithClassic=(s)=>s.startsWith('ah, the classic')||s.startsWith('ah the classic');const last=this._lastNarratorComment;const lastNorm=normalize(last);let newNorm=normalize(responseText);if(last){if(newNorm===lastNorm){const alts=fallbacks.filter((f)=>normalize(f)!==lastNorm);if(alts.length){responseText=Utils.randomChoice(alts);newNorm=normalize(responseText);}}
if(startsWithClassic(newNorm)&&startsWithClassic(lastNorm)){const alts=fallbacks.filter((f)=>!startsWithClassic(normalize(f)));if(alts.length){responseText=Utils.randomChoice(alts);newNorm=normalize(responseText);}}}
if(startsWithClassic(newNorm)){if(this._usedClassicThisRun){const alts=fallbacks.filter((f)=>!startsWithClassic(normalize(f)));if(alts.length){responseText=Utils.randomChoice(alts);}}else{this._usedClassicThisRun=true;}}
this._lastNarratorComment=responseText;this._narratorCommentCount+=1;return responseText;}catch(error){if(error.message.includes('timed out')){console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)','color: #f80; font-weight: bold');console.log(`  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,);console.log('  ✅ Once awake, subsequent requests will use AI!');}else{console.log('%c🤖 NARRATOR (Fallback - Connection Error)','color: #f00; font-weight: bold');console.error('  Error:',error);}
return Utils.randomChoice(fallbacks);}},async generateNames(race,classType,count=3){const desiredCount=Math.max(1,count||3);const candidates=[];const tryAiNames=async()=>{if(!CONFIG.ENABLE_AI){console.log('%c📛 NAMES (Fallback - AI Disabled)','color: #ff0; font-weight: bold',);return;}
try{console.log('%c📛 NAMES: Calling backend AI...','color: #0ff; font-weight: bold',);console.log('  Request:',{race,classType,count:desiredCount});console.log(`  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,);const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/names`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({race:race,class_type:classType,count:desiredCount*2,}),},);if(!response.ok){console.log('%c📛 NAMES (Fallback - API Error)','color: #f80; font-weight: bold',);return;}
const data=await response.json();if(data.success&&Array.isArray(data.names)&&data.names.length>0){console.log('%c📛 NAMES (AI Generated) ✨','color: #0f0; font-weight: bold',);console.log('  Response:',data.names);candidates.push(...data.names);}}catch(error){if(error.message&&error.message.includes('timed out')){console.log('%c📛 NAMES (Fallback - Backend Waking Up)','color: #f80; font-weight: bold',);console.log(`  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,);console.log('  ✅ Once awake, subsequent requests will use AI!',);}else{console.log('%c📛 NAMES (Fallback - Connection Error)','color: #f00; font-weight: bold',);console.error('  Error:',error);}}};const addFallbackCandidates=(multiplier=3)=>{console.log('%c📛 NAMES (Fallback)','color: #f80; font-weight: bold',);const extra=this.generateFallbackNames(race,desiredCount*multiplier);candidates.push(...extra);};await tryAiNames();if(!candidates.length){addFallbackCandidates(3);}
let unique=this._filterAndRegisterUniqueNames(candidates,desiredCount);if(unique.length<desiredCount){addFallbackCandidates(5);const more=this._filterAndRegisterUniqueNames(candidates,desiredCount-unique.length,);unique=unique.concat(more);}
return unique.slice(0,desiredCount);},async generateCharacterSummary(character,options={}){const nameCount=typeof options.nameCount==='number'&&options.nameCount>0?options.nameCount:3;const race=character&&character.race;const classType=character&&character.class;const buildLocalFallback=()=>{const fallbackNames=this.generateFallbackNames(race||'human',nameCount);const template='{{NAME}} is a '+`${race || 'mysterious'}\u0020${classType || 'adventurer'} with a mysterious past. `+"They don't talk about it much. Probably for the best.";return{names:fallbackNames,backstoryTemplate:template,};};if(!CONFIG.ENABLE_AI){console.log('%c📦 SUMMARY (Fallback - AI Disabled)','color: #ff0; font-weight: bold',);return buildLocalFallback();}
try{console.log('%c📦 SUMMARY: Calling backend AI for names + backstory template...','color: #0ff; font-weight: bold',);const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/summary`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({race:race,class_type:classType,alignment:character&&character.alignment,background:character&&character.background,personality:character&&(character.personalityTrait||character.personality),name_count:nameCount*2,}),},);if(!response.ok){const status=response.status;let detail=null;try{const errBody=await response.json();if(errBody&&errBody.detail){detail=errBody.detail;}}catch{}
if(status===429){console.log('%c📦 SUMMARY (Cooldown / Quota Limit)','color: #ff0; font-weight: bold',);try{window.dispatchEvent(new CustomEvent('danddy:creationQuotaUpdate',{detail:{remaining:0},}),);}catch(_){}}else{console.log('%c📦 SUMMARY (Fallback - API Error)','color: #f80; font-weight: bold',);console.log('  Status:',status);}
return buildLocalFallback();}
const data=await response.json();if(!data||data.success!==true){console.log('%c📦 SUMMARY (Fallback - Bad Payload)','color: #f80; font-weight: bold',);return buildLocalFallback();}
let names=Array.isArray(data.names)?data.names.slice():[];const template=typeof data.backstory_template==='string'&&data.backstory_template.trim()?data.backstory_template:null;if(names.length){names=this._filterAndRegisterUniqueNames(names,nameCount);}
if(!names.length){console.log('%c📦 SUMMARY (Fallback - No Names From Backend)','color: #f80; font-weight: bold',);const fallback=buildLocalFallback();if(template){fallback.backstoryTemplate=template;}
return fallback;}
console.log('%c📦 SUMMARY (AI Generated) ✨','color: #0f0; font-weight: bold',);console.log('  Names:',names);return{names,backstoryTemplate:template||(character&&character.backstory)||buildLocalFallback().backstoryTemplate,};}catch(error){if(error.message&&error.message.includes('timed out')){console.log('%c📦 SUMMARY (Fallback - Backend Waking Up)','color: #f80; font-weight: bold',);console.log('  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',);}else{console.log('%c📦 SUMMARY (Fallback - Connection Error)','color: #f00; font-weight: bold',);console.error('  Error:',error);}
return buildLocalFallback();}},generateFallbackNames(race,count){const pattern=window.CharacterNameData?CharacterNameData.getPattern(race):{first:['Hero'],last:['Unknown']};const result=[];const usedLocalCombos=new Set();let attempts=0;const maxAttempts=count*20;while(result.length<count&&attempts<maxAttempts){const firstName=Utils.randomChoice(pattern.first);const lastName=Utils.randomChoice(pattern.last);const fullName=`${firstName}\u0020${lastName}`;if(!usedLocalCombos.has(fullName)){usedLocalCombos.add(fullName);result.push(fullName);}
attempts++;}
return result;},_filterAndRegisterUniqueNames(candidates,maxCount){const result=[];const target=typeof maxCount==='number'&&maxCount>0?maxCount:Number.POSITIVE_INFINITY;for(const raw of candidates){if(result.length>=target)break;if(!raw)continue;const trimmed=String(raw).trim();if(!trimmed)continue;const parts=trimmed.split(/\s+/);if(parts.length===0)continue;const first=parts[0];const last=parts.slice(1).join(' ')||'';if(!first)continue;const firstKey=first.toLowerCase();const lastKey=last.toLowerCase();const fullKey=last?`${firstKey}\u0020${lastKey}`:firstKey;if(this._usedFullNames.has(fullKey)||this._usedFirstNames.has(firstKey)||(last&&this._usedLastNames.has(lastKey))){continue;}
this._usedFullNames.add(fullKey);this._usedFirstNames.add(firstKey);if(last){this._usedLastNames.add(lastKey);}
result.push(trimmed);}
return result;},async generateBackstory(character){const fallback=`${character.name} is a ${character.race}\u0020${character.class} with a mysterious past. `
+"They don't talk about it much. Probably for the best.";if(!CONFIG.ENABLE_AI){console.log('%c📖 BACKSTORY (Fallback - AI Disabled)','color: #ff0; font-weight: bold');return fallback;}
try{console.log('%c📖 BACKSTORY: Calling backend AI...','color: #0ff; font-weight: bold');console.log('  Request:',{name:character.name,race:character.race,class:character.class});console.log(`  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,);const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/backstory`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({name:character.name,race:character.race,class_type:character.class,personality:character.personalityTrait||'mysterious',background:character.background,}),});if(!response.ok){console.log('%c📖 BACKSTORY (Fallback - API Error)','color: #f80; font-weight: bold');return fallback;}
const data=await response.json();if(data.success&&data.backstory){console.log('%c📖 BACKSTORY (AI Generated) ✨','color: #0f0; font-weight: bold');console.log('  Response:',data.backstory.substring(0,100)+'...');return data.backstory;}}catch(error){if(error.message.includes('timed out')){console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)','color: #f80; font-weight: bold');console.log(`  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,);console.log('  ✅ Once awake, subsequent requests will use AI!');}else{console.log('%c📖 BACKSTORY (Fallback - Connection Error)','color: #f00; font-weight: bold');console.error('  Error:',error);}}
console.log('%c📖 BACKSTORY (Fallback)','color: #f80; font-weight: bold');return fallback;},async generateOptionVariations(questionText,options){if(!CONFIG.ENABLE_AI||CONFIG.ENABLE_AI_OPTION_VARIATIONS===false){console.log('%c🎲 OPTIONS (Fallback - AI Disabled or variations off)','color: #ff0; font-weight: bold',);return options.map((opt)=>opt.text);}
const optionDescriptions=options.map((opt)=>`Value: "${opt.value}", Default text: "${opt.text}"`).join('\n');const prompt=`For the question: "${questionText}"

Generate fresh, creative variations for these D&D character creation options. Keep each variation to 4-8 words, punchy and clear. Match the tone of each original but make them feel unique:

${optionDescriptions}

Format your response as JSON array of strings, one for each option in order. Example: ["text1", "text2", "text3", "text4"]`;const systemPrompt='You are a creative D&D character creation assistant. Generate engaging option text that feels fresh but maintains the same meaning. '+'Be concise and direct. Return ONLY valid JSON.';console.log('%c🎲 OPTIONS: Calling backend AI...','color: #0ff; font-weight: bold');console.log('  Note: Will fallback to original option texts if unavailable...');const response=await this.generateCompletion(prompt,systemPrompt);if(response){try{const jsonMatch=response.match(/\[.*\]/s);if(jsonMatch){const variations=JSON.parse(jsonMatch[0]);if(Array.isArray(variations)&&variations.length===options.length){console.log('%c🎲 OPTIONS (AI Generated) ✨','color: #0f0; font-weight: bold');return variations;}}}catch(error){console.log('Failed to parse AI option variations:',error);}}
console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅','color: #f80; font-weight: bold');console.log('  The original option texts will be used instead of AI variations');return options.map((opt)=>opt.text);},async generatePortraitImage(character){if(!CONFIG.ENABLE_AI){console.log('AI service disabled for image generation');return null;}
const prompt=this.buildPortraitPrompt(character);return await this.generateImageFromPrompt(prompt);},async generateImageFromPrompt(prompt,options={}){if(!CONFIG.ENABLE_AI){console.log('%c🎨 DALL-E (Unavailable - AI Disabled)','color: #ff0; font-weight: bold');return null;}
const forceModel=options.forceModel||null;const isRetry=options._isRetry||false;try{let model=forceModel||'dall-e-3';if(!forceModel){try{if(window.StorageService&&typeof StorageService.getImageModel==='function'){model=StorageService.getImageModel();}else if(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL){model=CONFIG.DEFAULT_IMAGE_MODEL;}}catch(e){console.warn('AIService.generateImageFromPrompt: failed to read image model, using default',e);}}
try{if(typeof this.getImageQuotaStatus==='function'){const quota=await this.getImageQuotaStatus();if(quota&&quota.enforced&&quota.remaining===0){const resetAt=quota.reset_at||quota.resetAt||null;const msg=resetAt?`Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`:'Daily image limit reached. Please try again tomorrow.';if(window.UIService){window.UIService.showNotification(msg,'warning',8000);}
const rateLimitError=new Error(msg);rateLimitError.isRateLimit=true;rateLimitError.limit=quota.limit;rateLimitError.remaining=quota.remaining;rateLimitError.resetAt=resetAt;throw rateLimitError;}}}catch(quotaErr){}
console.log('%c🎨 IMAGE: Calling backend AI...','color: #0ff; font-weight: bold');console.log('  Prompt (preview):',prompt.substring(0,100)+(prompt.length>100?'…':''));console.log('  Model:',model+(forceModel?' (fallback)':''));console.log('  Note: Image generation takes 20-30s (longer than text AI)...');const defaultQuality={'dall-e-3':'standard','gpt-image-1':'medium','flux-1.1-pro':'standard','flux-schnell':'standard',};let quality=defaultQuality[model]||'standard';const isDemoMode=window.DemoCharacters&&typeof DemoCharacters.isDemoMode==='function'&&DemoCharacters.isDemoMode();if(isDemoMode&&model==='gpt-image-1'){quality='medium';console.log(`  Quality: MEDIUM (demo mode default)`);}else{try{if(window.StorageService&&typeof StorageService.getImageQuality==='function'){const savedQuality=StorageService.getImageQuality(model);if(savedQuality){quality=savedQuality;console.log(`  Quality: ${quality.toUpperCase()} (user preference)`);}}}catch(e){console.warn('AIService: failed to read quality setting',e);}}
const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({prompt:prompt,size:'1024x1024',quality:quality,model:model,}),},70000);if(!response.ok){const errorData=await response.json();console.log('%c🎨 IMAGE (Error)','color: #f00; font-weight: bold');console.log('  Error:',errorData.detail);const extractErrorMessage=(detail)=>{if(!detail)return null;if(Array.isArray(detail)){return detail.map(err=>{if(typeof err==='string')return err;const field=err.loc?err.loc.slice(1).join('.'):'unknown';return`${field}: ${err.msg || err.message || JSON.stringify(err)}`;}).join('; ');}
if(typeof detail==='object'){return detail.msg||detail.message||JSON.stringify(detail);}
return String(detail);};const errorMessage=extractErrorMessage(errorData.detail);if(response.status===429){const resetAt=(errorData&&(errorData.reset_at||errorData.resetAt))||null;const remaining=errorData&&typeof errorData.remaining==='number'?errorData.remaining:null;const limit=errorData&&typeof errorData.limit==='number'?errorData.limit:null;const msg=errorMessage||(resetAt?`Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`:'Daily image limit reached.');if(window.UIService){window.UIService.showNotification(msg,'warning',8000);}
const rateLimitError=new Error(msg);rateLimitError.isRateLimit=true;rateLimitError.limit=limit;rateLimitError.remaining=remaining;rateLimitError.resetAt=resetAt;throw rateLimitError;}
const detailStr=typeof errorData.detail==='string'?errorData.detail:errorMessage;if(response.status===502&&detailStr&&(detailStr.toLowerCase().includes('flux')||detailStr.toLowerCase().includes('replicate'))){console.warn('⚠️ Replicate/Flux service error:',detailStr);const fluxError=new Error('Flux image generation service is temporarily unavailable');fluxError.isFluxError=true;fluxError.originalMessage=detailStr;fluxError.suggestModelSwitch=true;throw fluxError;}
if(response.status===400&&detailStr&&detailStr.toLowerCase().includes('safety system')){console.warn('⚠️ OpenAI safety system rejection:',detailStr);console.warn('📝 REJECTED PROMPT:',prompt);const analysis=this.analyzeRejectedPrompt(prompt);const safetyError=new Error('Portrait generation was flagged by OpenAI\'s content safety system');safetyError.isSafetyRejection=true;safetyError.originalMessage=detailStr;safetyError.rejectedPrompt=prompt;safetyError.promptAnalysis=analysis;throw safetyError;}
throw new Error(errorMessage||`API error: ${response.status}`);}
const data=await response.json();if(data.success){console.log('%c🎨 IMAGE (Generated) ✨','color: #0f0; font-weight: bold');console.log('  URL:',data.url.substring(0,50)+'...');try{const limitStr=response.headers.get('x-danddy-image-limit');const remainingStr=response.headers.get('x-danddy-image-remaining');const resetStr=response.headers.get('x-danddy-image-reset');const quotaInfo={limit:limitStr!=null?parseInt(limitStr,10):null,remaining:remainingStr!=null?parseInt(remainingStr,10):null,resetEpoch:resetStr!=null?parseInt(resetStr,10):null,};window.dispatchEvent(new CustomEvent('danddy:imageQuotaUpdate',{detail:quotaInfo}),);if(window.UIService&&typeof quotaInfo.remaining==='number'&&quotaInfo.remaining>=0&&quotaInfo.remaining<=2){window.UIService.showNotification(`Images left today: ${quotaInfo.remaining}`,'info',5000,);}}catch(e){}
return data.url;}
return null;}catch(error){console.log('%c🎨 IMAGE (Failed)','color: #f00; font-weight: bold');console.error('  Error:',error);if(error.isFluxError&&!isRetry){console.log('%c🔄 AUTO-FALLBACK: Flux unavailable, trying GPT Image instead...','color: #fa0; font-weight: bold');if(window.UIService){window.UIService.showNotification('Flux unavailable, switching to GPT Image...','info',4000);}
return this.generateImageFromPrompt(prompt,{forceModel:'gpt-image-1',_isRetry:true});}
throw error;}},async getImageQuotaStatus(){try{const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/quota`,{method:'GET'},10000,);if(!response.ok)return null;const data=await response.json();const normalized={...data,resetAt:data.reset_at||data.resetAt,resetEpoch:data.reset_epoch||data.resetEpoch,};try{window.dispatchEvent(new CustomEvent('danddy:imageQuotaUpdate',{detail:{limit:normalized.limit,remaining:normalized.remaining,resetEpoch:normalized.resetEpoch,},}),);}catch(_){}
return normalized;}catch(e){return null;}},async getCreationQuotaStatus(){try{const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/quota`,{method:'GET'},10000,);if(!response.ok)return null;const data=await response.json();const normalized={...data,resetAt:data.reset_at||data.resetAt,resetEpoch:data.reset_epoch||data.resetEpoch,};try{window.dispatchEvent(new CustomEvent('danddy:creationQuotaUpdate',{detail:{limit:normalized.limit,remaining:normalized.remaining,resetEpoch:normalized.resetEpoch,},}),);}catch(_){}
return normalized;}catch(e){return null;}},buildCharacterDescription(character){const parts=[];parts.push('Dungeons & Dragons fantasy character:');if(character.sex){parts.push(character.sex);}
if(character.race){let raceDesc=null;try{if(window.PortraitPrompt&&typeof PortraitPrompt.getVariableSnippet==='function'){raceDesc=PortraitPrompt.getVariableSnippet('race',character.race);}}catch(e){}
if(!raceDesc){raceDesc=window.PortraitPrompt?PortraitPrompt.getRaceDescription(character.race):character.race;}
parts.push(raceDesc);}
if(character.class){let classDesc=null;try{if(window.PortraitPrompt&&typeof PortraitPrompt.getVariableSnippet==='function'){classDesc=PortraitPrompt.getVariableSnippet('class',character.class);}}catch(e){}
if(!classDesc){classDesc=window.PortraitPrompt?PortraitPrompt.getClassDescription(character.class):character.class;}
parts.push(classDesc);}
if(character.class&&window.PortraitPrompt){const magicText=PortraitPrompt.getMagicSpecialization(character.class);if(magicText){parts.push(magicText);}}
if(character.alignment){if(character.alignment.includes('good')){parts.push('with noble bearing');}else if(character.alignment.includes('evil')){parts.push('with a menacing aura');}}
if(character.background){try{let backgroundLabel=character.background;let backgroundFeature=character.backgroundFeature||null;if(typeof DND_DATA!=='undefined'&&Array.isArray(DND_DATA.backgrounds)){const bgObj=DND_DATA.backgrounds.find((b)=>b.id===character.background,);if(bgObj){backgroundLabel=bgObj.name||backgroundLabel;if(!backgroundFeature&&bgObj.feature){if(typeof bgObj.feature==='string'){backgroundFeature=bgObj.feature;}else if(typeof bgObj.feature.name==='string'){backgroundFeature=bgObj.feature.name;}else if(typeof bgObj.feature.description==='string'){backgroundFeature=bgObj.feature.description;}}}}
let backgroundText=`${String(backgroundLabel).toLowerCase()} background`;if(backgroundFeature){const featureText=String(backgroundFeature);if(!featureText.includes('[object Object]')){backgroundText+=` with background feature "${featureText}"`;}}
parts.push(backgroundText);}catch(e){parts.push(`background: ${character.background}`);}}
return parts.join(', ');},buildPortraitPrompt(character){const classKey=(character.class||'default').toLowerCase();const{pose:posePrompt,camera:cameraPrompt}=window.PortraitPoseData&&typeof PortraitPoseData.getRandomPoseAndCamera==='function'?PortraitPoseData.getRandomPoseAndCamera(classKey):{pose:'standing in a relaxed but heroic stance',camera:'Camera angle: three-quarter view that clearly shows the full silhouette.',};let promptThemeId=null;try{if(typeof window!=='undefined'&&window.StorageService&&typeof window.StorageService.getPortraitPromptTheme==='function'){promptThemeId=window.StorageService.getPortraitPromptTheme();}else if(typeof CONFIG!=='undefined'&&CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME){promptThemeId=CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME;}}catch(e){}
let styleDescription='';let backgroundDescription='';if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.buildStyleAndBackgroundDescriptions==='function'){try{const sections=window.PortraitPrompt.buildStyleAndBackgroundDescriptions({posePrompt,cameraPrompt,themeId:promptThemeId,})||{};styleDescription=sections.styleDescription||'';backgroundDescription=sections.backgroundDescription||'';}catch(e){}}
if(!styleDescription){styleDescription='High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';}
if(!backgroundDescription){backgroundDescription='Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';}
const name=(character&&character.name)||'Unnamed character';const raceId=character&&character.race?String(character.race):null;const classId=character&&character.class?String(character.class):null;let raceLabel=raceId;let classLabel=classId;try{if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.getVariableSnippet==='function'){if(raceId){const customRace=window.PortraitPrompt.getVariableSnippet('race',raceId);if(customRace)raceLabel=customRace;}
if(classId){const customClass=window.PortraitPrompt.getVariableSnippet('class',classId);if(customClass)classLabel=customClass;}}}catch(e){}
let backgroundLabel=null;if(character&&character.background){backgroundLabel=String(character.background);try{if(typeof DND_DATA!=='undefined'&&Array.isArray(DND_DATA.backgrounds)){const bgObj=DND_DATA.backgrounds.find((b)=>b.id===character.background,);if(bgObj&&bgObj.name){backgroundLabel=String(bgObj.name);}}}catch(e){}}
const headerParts=[];if(character&&character.sex){headerParts.push(character.sex);}
if(raceLabel)headerParts.push(raceLabel);if(classLabel)headerParts.push(classLabel);if(classId&&window.PortraitPrompt&&typeof PortraitPrompt.getMagicSpecialization==='function'){const magicText=PortraitPrompt.getMagicSpecialization(classId);if(magicText){headerParts.push(magicText);}}
if(backgroundLabel)headerParts.push(backgroundLabel);const headerSuffix=headerParts.join(', ');const headerLine=headerSuffix?`${name}: ${headerSuffix}`:`${name}`;let prompt=`Dungeons & Dragons fantasy character portrait:\n${headerLine}\n\nPose: ${posePrompt}`;if(styleDescription){prompt+=`\n\nSTYLE: ${styleDescription}`;}
if(backgroundDescription){prompt+=`\n\nScene: ${backgroundDescription}`;}
return prompt;},analyzeRejectedPrompt(prompt){console.log('%c🔍 Analyzing Rejected Prompt','color: #ff0; font-weight: bold; font-size: 14px;');console.log('─'.repeat(80));const potentialIssues=[];const warningPatterns=[{pattern:/\b(blood|gore|violence|death|kill|weapon|sword|axe|dagger|knife)\b/gi,category:'Violence/Weapons'},{pattern:/\b(dark|evil|demon|devil|hell|sinister|menacing|malevolent)\b/gi,category:'Dark Themes'},{pattern:/\b(naked|nude|exposed|bare|revealing|sensual|seductive)\b/gi,category:'Adult Content'},{pattern:/\b(child|young|minor|kid|juvenile)\b/gi,category:'Age-Related'},{pattern:/\b(slave|slavery|bound|chained|prisoner)\b/gi,category:'Sensitive Topics'},];warningPatterns.forEach(({pattern,category})=>{const matches=prompt.match(pattern);if(matches&&matches.length>0){potentialIssues.push({category,matches:[...new Set(matches.map(m=>m.toLowerCase()))],count:matches.length});}});const sections=prompt.split(', ').filter(s=>s.trim());console.log('📋 PROMPT SECTIONS (%d total):',sections.length);sections.forEach((section,idx)=>{const sectionLower=section.toLowerCase();let hasWarning=false;for(const{pattern}of warningPatterns){if(pattern.test(section)){hasWarning=true;break;}}
const marker=hasWarning?'⚠️ ':'   ';console.log(`${marker}${idx + 1}. ${section}`);});console.log('─'.repeat(80));if(potentialIssues.length>0){console.log('%c⚠️  POTENTIAL ISSUES DETECTED:','color: #f90; font-weight: bold;');potentialIssues.forEach(issue=>{console.log(`  • ${issue.category}: ${issue.matches.join(', ')} (${issue.count}x)`);});}else{console.log('%c✓ No obvious problematic patterns detected','color: #0f0;');console.log('  The rejection may be due to:');console.log('  • Combination of terms that seem innocent individually');console.log('  • Character race/class combinations OpenAI finds problematic');console.log('  • Background story content or phrasing');console.log('  • OpenAI policy updates or temporary sensitivity changes');}
console.log('─'.repeat(80));console.log('%c💡 DEBUGGING SUGGESTIONS:','color: #0ff; font-weight: bold;');console.log('  1. Try regenerating - sometimes the same prompt works on retry');console.log('  2. Simplify the backstory or character description');console.log('  3. Remove alignment-based descriptions (e.g., "menacing aura")');console.log('  4. Adjust weapon/equipment descriptions to be less specific');console.log('  5. Use the custom prompt modal to test simplified versions');console.log('─'.repeat(80));return{sections,potentialIssues,hasKnownProblematicTerms:potentialIssues.length>0};},});const Components=(window.Components={renderNarratorMessage(text){return`
      <div class="narrator-message">
        <div class="narrator-text">${text}</div>
      </div>
    `;},renderQuestion(question){const optionsHTML=question.options.map((opt,index)=>`
          <button class="button-primary" onclick="App.handleAnswer('${question.id}', ${index})">
            ${opt.text}
          </button>
        `,).join('');return`
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${optionsHTML}
        </div>
      </div>
    `;},renderTextInput(question){return`
      <div class="question-card" data-question-id="${question.id}">
        <div class="question-text">${question.text}</div>
        <input type="text" class="input-field" id="text-input" placeholder="${question.placeholder || 'Type here...'}">
        <button class="button-primary mt-md" onclick="App.handleTextInput('${question.id}')">
          CONTINUE
        </button>
      </div>
    `;},renderCharacterSheet(character,portrait=null,showPortrait=true,extraOptions={},){const{showGeneratePortraitButton=true}=extraOptions||{};return`
      <div class="character-sheet">
        ${CharacterSheet.render(character, {
          context: 'builder',
          showPortrait: showPortrait,
          // In quick-create mode we may want to suppress the custom AI portrait
          // button until the first custom image has actually been generated.
          onGeneratePortrait: showGeneratePortraitButton,
          onRename: true,
          onTogglePortrait: true,
          onLevelChange: true,
          onPrint: true,
        })}
      </div>
    `;},renderSettings(){const currentNarratorId=StorageService.getNarratorId();const narratorsList=getNarratorList();let isUserAdmin=false;try{if(window.AuthService&&typeof AuthService.isAuthenticated==='function'&&AuthService.isAuthenticated()){const token=AuthService.getToken?AuthService.getToken():null;if(token){const payload=token.split('.')[1];const decoded=JSON.parse(atob(payload));isUserAdmin=decoded.role==='admin';}}}catch(e){}
const modelQualityOptions={'dall-e-3':[{value:'standard',label:'Standard'},{value:'hd',label:'HD'},],'gpt-image-1':[{value:'medium',label:'Medium'},{value:'high',label:'High'},],'flux-1.1-pro':[],'flux-schnell':[],};const getDefaultQuality=(model)=>{const options=modelQualityOptions[model]||[];return options.length>0?options[0].value:null;};const getCurrentImageQuality=(model)=>{if(!StorageService||typeof StorageService.getImageQuality!=='function'){return getDefaultQuality(model);}
try{const quality=StorageService.getImageQuality(model);if(quality)return quality;if(model==='gpt-image-1'&&StorageService.getHighQualityGPTImage){return StorageService.getHighQualityGPTImage()?'high':'medium';}
return getDefaultQuality(model);}catch(e){return getDefaultQuality(model);}};const truncate=(text,maxLength)=>{return text.length>maxLength?text.substring(0,maxLength-3)+'...':text;};const formatNarratorTitle=(narrator)=>{if(!narrator)return'';const base=String(narrator.name||narrator.id||'').trim();if(!base)return'';return base.split(/[-_\s]+/).filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(' ');};const getCurrentTextSpeed=()=>{if(!StorageService||typeof StorageService.getTextSpeedMultiplier!=='function'){return 1;}
try{return StorageService.getTextSpeedMultiplier();}catch(e){console.warn('Settings: failed to read text speed multiplier',e);return 1;}};const currentTextSpeedMultiplier=getCurrentTextSpeed();const getCurrentImageModel=()=>{if(!StorageService||typeof StorageService.getImageModel!=='function'){return(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL)||'dall-e-3';}
try{return StorageService.getImageModel();}catch(e){console.warn('Settings: failed to read image model preference',e);return(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL)||'dall-e-3';}};const currentNarrator=narratorsList.find((n)=>n.id===currentNarratorId)||narratorsList[0];const currentNarratorLabel=currentNarrator?formatNarratorTitle(currentNarrator):'Choose narrator';const narratorOptionsMenu=narratorsList.map((narrator)=>{const label=formatNarratorTitle(narrator);const isSelected=narrator.id===currentNarratorId;return`
          <button
            class="selector-option${isSelected ? ' is-selected' : ''}"
            type="button"
            role="option"
            data-value="${narrator.id}"
            aria-selected="${isSelected ? 'true' : 'false'}"
          >
            <span class="selector-option-label">
              ${label}
            </span>
          </button>
        `;}).join('');const textSpeedOptions=[{value:1,label:'Normal'},{value:1.5,label:'Fast (1.5×)'},{value:2,label:'Very Fast (2×)'},];const currentTextSpeedOption=textSpeedOptions.find((opt)=>opt.value===currentTextSpeedMultiplier)||textSpeedOptions[0];const currentTextSpeedLabel=currentTextSpeedOption.label;const imageModelOptions=[{value:'dall-e-3',label:'DALL·E 3 (high detail)'},{value:'gpt-image-1',label:'GPT Image 1 (OpenAI)'},{value:'flux-1.1-pro',label:'Flux Pro (high quality)'},{value:'flux-schnell',label:'Flux Schnell (fast)'},];const currentImageModelValue=getCurrentImageModel();const currentImageModelOption=imageModelOptions.find((opt)=>opt.value===currentImageModelValue)||imageModelOptions[0];const currentImageModelLabel=currentImageModelOption.label;const currentQualityOptions=modelQualityOptions[currentImageModelValue]||[];const currentQualityValue=getCurrentImageQuality(currentImageModelValue);const currentQualityOption=currentQualityOptions.find((opt)=>opt.value===currentQualityValue,)||currentQualityOptions[0];const currentQualityLabel=currentQualityOption?.label||'';const hasQualityOptions=currentQualityOptions.length>0&&isUserAdmin;const getPortraitViewMode=()=>{if(window.StorageService&&StorageService.getPortraitViewMode){return StorageService.getPortraitViewMode();}
return(CONFIG&&CONFIG.DEFAULT_PORTRAIT_VIEW_MODE)||'original';};const currentPortraitViewMode=getPortraitViewMode();const getPortraitPromptTheme=()=>{try{if(window.StorageService&&StorageService.getPortraitPromptTheme){return StorageService.getPortraitPromptTheme();}}catch(e){console.warn('Settings: failed to read portrait prompt theme',e);}
if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.getDefaultThemeId==='function'){try{return window.PortraitPrompt.getDefaultThemeId();}catch(e){}}
return(CONFIG&&CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME)||null;};const currentPromptThemeId=getPortraitPromptTheme();if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.syncFromAPI==='function'){window.PortraitPrompt.syncFromAPI();}
let promptThemes=[];if(typeof window!=='undefined'&&window.PortraitPrompt&&typeof window.PortraitPrompt.getThemes==='function'){try{promptThemes=window.PortraitPrompt.getThemes()||[];}catch(e){console.warn('Settings: failed to read portrait prompt themes',e);}}
if(!Array.isArray(promptThemes)||!promptThemes.length){promptThemes=[{id:'cinematic-inks',label:'Cinematic Inks (default)',description:'More cinematic lighting and framing while staying in black-and-white ink.',},];}
promptThemes=promptThemes.slice().sort((a,b)=>{const nameA=(a.id||'').toLowerCase();const nameB=(b.id||'').toLowerCase();return nameA.localeCompare(nameB);});const activePromptTheme=promptThemes.find((t)=>t.id===currentPromptThemeId)||promptThemes[0];const formatThemeName=(theme)=>{const rawId=(theme&&theme.id)||'';const base=String(rawId||'').trim()||String(theme.label||'');if(!base)return'';return base.split(/[-_\s]+/).filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(' ');};const currentPromptThemeLabel=activePromptTheme?formatThemeName(activePromptTheme):'Cinematic Inks';return`
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">Settings</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <div class="settings-group">
                  <div class="settings-group-label">[ Builder ]</div>
                  <section class="settings-section">
                    <div class="settings-row-inline">
                      <div class="settings-inline-field">
                        <div class="settings-label">Narrator Voice</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                        <button
                          class="terminal-btn selector-trigger"
                          id="narrator-select-trigger"
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded="false"
                          onclick="CharacterSheet.toggleSelectorMenu(this)"
                        >
                          <span class="selector-trigger-label" id="narrator-select-label">
                            ${currentNarratorLabel}
                          </span>
                        </button>
                        <div
                          class="selector-menu"
                          role="listbox"
                          aria-label="Narrator voice"
                          aria-hidden="true"
                        >
                          ${narratorOptionsMenu}
                        </div>
                      </div>
                      <select
                        id="narrator-select"
                        class="terminal-select settings-select hidden"
                      >
                        ${narratorsList
                          .map((narrator) => {
                            const label = formatNarratorTitle(narrator);
                            return `<option value="${narrator.id}"${narrator.id===currentNarratorId?'selected':''}>${label}</option>`;
                          })
                          .join('')}
                      </select>
                    </div>
                    <div class="settings-inline-field">
                      <div class="settings-label">Text Speed</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                        <button
                          class="terminal-btn selector-trigger"
                          id="text-speed-select-trigger"
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded="false"
                          onclick="CharacterSheet.toggleSelectorMenu(this)"
                        >
                          <span class="selector-trigger-label" id="text-speed-select-label">
                            ${currentTextSpeedLabel}
                          </span>
                        </button>
                        <div
                          class="selector-menu"
                          role="listbox"
                          aria-label="Narrator text speed"
                          aria-hidden="true"
                        >
                          ${textSpeedOptions
                            .map((opt) => {
                              const isSelected =
                                opt.value === currentTextSpeedOption.value;
                              return `<button
class="selector-option${isSelected ? ' is-selected' : ''}"
type="button"
role="option"
data-value="${opt.value}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${opt.label}</span></button>`;
                            })
                            .join('')}
                        </div>
                      </div>
                      <select
                        id="text-speed-select"
                        class="terminal-select settings-select hidden"
                      >
                        ${textSpeedOptions
                          .map(
                            (opt) => `<option value="${opt.value}"${opt.value===currentTextSpeedOption.value?'selected':''}>${opt.label}</option>`,
                          )
                          .join('')}
                      </select>
                      </div>
                    </div>
                  </section>
                </div>

                <div class="settings-group">
                  <div class="settings-group-label">[ Image generation ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked mb-lg">
                      <div class="settings-label">Style</div>
                      <div class="settings-field">
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="portrait-theme-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span
                              class="selector-trigger-label"
                              id="portrait-theme-select-label"
                            >
                              ${currentPromptThemeLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Portrait prompt theme"
                            aria-hidden="true"
                          >
                            ${promptThemes
                              .map((theme) => {
                                const isSelected = theme.id === activePromptTheme.id;
                                const label = formatThemeName(theme);
                                return `<button
class="selector-option${isSelected?' is-selected':''}"
type="button"
role="option"
data-value="${theme.id}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${label}</span></button>`;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="portrait-theme-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${promptThemes
                            .map((theme) => {
                              const label = formatThemeName(theme);
                              return `<option value="${theme.id}"${theme.id===activePromptTheme.id?'selected':''}>${label}</option>`;
                            })
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row-inline mb-lg">
                      <div class="settings-inline-field">
                        <div class="settings-label">AI model</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="image-model-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span class="selector-trigger-label" id="image-model-select-label">
                              ${currentImageModelLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="AI model"
                            aria-hidden="true"
                          >
                            ${imageModelOptions
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentImageModelOption.value;
                                return `<button
class="selector-option${isSelected ? ' is-selected' : ''}"
type="button"
role="option"
data-value="${opt.value}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${opt.label}</span></button>`;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="image-model-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${imageModelOptions
                            .map(
                              (opt) => `<option value="${opt.value}"${opt.value===currentImageModelOption.value?'selected':''}>${opt.label}</option>`,
                            )
                            .join('')}
                        </select>
                      </div>
                      <div class="settings-inline-field settings-inline-field--quality ${hasQualityOptions ? '' : 'hidden'}" id="quality-selector-container">
                        <div class="settings-label">Quality</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="image-quality-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span class="selector-trigger-label" id="image-quality-select-label">
                              ${currentQualityLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Image quality"
                            aria-hidden="true"
                            id="image-quality-options-menu"
                          >
                            ${currentQualityOptions
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentQualityOption?.value;
                                return `<button
class="selector-option${isSelected ? ' is-selected' : ''}"
type="button"
role="option"
data-value="${opt.value}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${opt.label}</span></button>`;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="image-quality-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${currentQualityOptions
                            .map(
                              (opt) => `<option value="${opt.value}"${opt.value===currentQualityOption?.value?'selected':''}>${opt.label}</option>`,
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row settings-row--stacked">
                      <div class="settings-label">Default portrait view</div>
                      <div class="settings-field">
                        <div class="settings-radio-group" role="radiogroup" aria-label="Default portrait view">
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="original"
                              ${currentPortraitViewMode === 'original' ? 'checked' : ''}
                            >
                            <span class="settings-radio-label">Image</span>
                          </label>
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="ascii"
                              ${currentPortraitViewMode === 'original' ? '' : 'checked'}
                            >
                            <span class="settings-radio-label">ASCII</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="SettingsModal.close()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="SettingsModal.save()">SAVE</button>
          </div>
        </div>
      </div>
    `;},});const SettingsModal=(window.SettingsModal={_escHandler:null,open(){if(document.getElementById('settingsModal'))return;const settingsHTML=Components.renderSettings();const host=document.querySelector('.terminal-container')||document.querySelector('.terminal-frame')||document.body;host.insertAdjacentHTML('beforeend',settingsHTML);const modal=document.getElementById('settingsModal');if(modal&&typeof window.Utils!=='undefined'&&Utils.focusFirstFieldInModal){Utils.focusFirstFieldInModal(modal);}
this.initSelectors(modal);this._escHandler=(e)=>{if(e.key==='Escape'){SettingsModal.close();}};document.addEventListener('keydown',this._escHandler);},initSelectors(modal){if(!modal)return;const narratorTrigger=modal.querySelector('#narrator-select-trigger');const narratorLabel=modal.querySelector('#narrator-select-label');const narratorSelect=modal.querySelector('#narrator-select');const narratorOptions=modal.querySelectorAll('.selector-menu[aria-label="Narrator voice"] .selector-option',);if(narratorTrigger&&narratorLabel&&narratorSelect&&narratorOptions.length){narratorOptions.forEach((option)=>{option.addEventListener('click',(e)=>{e.stopPropagation();const value=option.getAttribute('data-value');const label=option.querySelector('.selector-option-label');if(value&&label){narratorLabel.textContent=label.textContent.trim();narratorSelect.value=value;narratorOptions.forEach((opt)=>{const isSelected=opt===option;opt.classList.toggle('is-selected',isSelected);opt.setAttribute('aria-selected',isSelected?'true':'false');});}});});}
const speedTrigger=modal.querySelector('#text-speed-select-trigger');const speedLabel=modal.querySelector('#text-speed-select-label');const speedSelect=modal.querySelector('#text-speed-select');const speedOptions=modal.querySelectorAll('.selector-menu[aria-label="Narrator text speed"] .selector-option',);if(speedTrigger&&speedLabel&&speedSelect&&speedOptions.length){speedOptions.forEach((option)=>{option.addEventListener('click',(e)=>{e.stopPropagation();const value=option.getAttribute('data-value');const label=option.querySelector('.selector-option-label');if(value&&label){speedLabel.textContent=label.textContent.trim();speedSelect.value=value;speedOptions.forEach((opt)=>{const isSelected=opt===option;opt.classList.toggle('is-selected',isSelected);opt.setAttribute('aria-selected',isSelected?'true':'false');});}});});}
const modelQualityOptionsMap={'dall-e-3':[{value:'standard',label:'Standard'},{value:'hd',label:'HD'},],'gpt-image-1':[{value:'medium',label:'Medium'},{value:'high',label:'High'},],'flux-1.1-pro':[],'flux-schnell':[],};const updateQualityOptions=(modelValue)=>{const qualityContainer=modal.querySelector('#quality-selector-container');const qualityLabel=modal.querySelector('#image-quality-select-label');const qualitySelect=modal.querySelector('#image-quality-select');const qualityMenu=modal.querySelector('#image-quality-options-menu');const options=modelQualityOptionsMap[modelValue]||[];let isAdmin=false;try{if(window.AuthService&&typeof AuthService.isAuthenticated==='function'&&AuthService.isAuthenticated()){const token=AuthService.getToken?AuthService.getToken():null;if(token){const payload=token.split('.')[1];const decoded=JSON.parse(atob(payload));isAdmin=decoded.role==='admin';}}}catch(e){}
if(!options.length||!isAdmin){if(qualityContainer)qualityContainer.classList.add('hidden');return;}
if(qualityContainer)qualityContainer.classList.remove('hidden');let currentQuality=null;if(window.StorageService&&StorageService.getImageQuality){currentQuality=StorageService.getImageQuality(modelValue);}
if(!currentQuality){currentQuality=options[0].value;}
if(qualityMenu){qualityMenu.innerHTML=options.map((opt)=>{const isSelected=opt.value===currentQuality;return`
              <button
                class="selector-option${isSelected ? ' is-selected' : ''}"
                type="button"
                role="option"
                data-value="${opt.value}"
                aria-selected="${isSelected ? 'true' : 'false'}"
              >
                <span class="selector-option-label">
                  ${opt.label}
                </span>
              </button>
            `;}).join('');const newQualityOptions=qualityMenu.querySelectorAll('.selector-option');newQualityOptions.forEach((qOpt)=>{qOpt.addEventListener('click',(e)=>{e.stopPropagation();const qValue=qOpt.getAttribute('data-value');const qLabel=qOpt.querySelector('.selector-option-label');if(qValue&&qLabel&&qualityLabel&&qualitySelect){qualityLabel.textContent=qLabel.textContent.trim();qualitySelect.value=qValue;newQualityOptions.forEach((o)=>{const isSelected=o===qOpt;o.classList.toggle('is-selected',isSelected);o.setAttribute('aria-selected',isSelected?'true':'false');});}});});}
if(qualitySelect){qualitySelect.innerHTML=options.map((opt)=>`
            <option value="${opt.value}" ${opt.value === currentQuality ? 'selected' : ''}>
              ${opt.label}
            </option>
          `,).join('');}
const activeOption=options.find((o)=>o.value===currentQuality)||options[0];if(qualityLabel&&activeOption){qualityLabel.textContent=activeOption.label;}};const imageModelTrigger=modal.querySelector('#image-model-select-trigger');const imageModelLabel=modal.querySelector('#image-model-select-label');const imageModelSelect=modal.querySelector('#image-model-select');const imageModelOptions=modal.querySelectorAll('.selector-menu[aria-label="AI model"] .selector-option',);if(imageModelTrigger&&imageModelLabel&&imageModelSelect&&imageModelOptions.length){imageModelOptions.forEach((option)=>{option.addEventListener('click',(e)=>{e.stopPropagation();const value=option.getAttribute('data-value');const label=option.querySelector('.selector-option-label');if(value&&label){imageModelLabel.textContent=label.textContent.trim();imageModelSelect.value=value;imageModelOptions.forEach((opt)=>{const isSelected=opt===option;opt.classList.toggle('is-selected',isSelected);opt.setAttribute('aria-selected',isSelected?'true':'false');});updateQualityOptions(value);}});});}
const qualityTrigger=modal.querySelector('#image-quality-select-trigger');const qualityLabel=modal.querySelector('#image-quality-select-label');const qualitySelect=modal.querySelector('#image-quality-select');const qualityOptions=modal.querySelectorAll('#image-quality-options-menu .selector-option',);if(qualityTrigger&&qualityLabel&&qualitySelect&&qualityOptions.length){qualityOptions.forEach((option)=>{option.addEventListener('click',(e)=>{e.stopPropagation();const value=option.getAttribute('data-value');const label=option.querySelector('.selector-option-label');if(value&&label){qualityLabel.textContent=label.textContent.trim();qualitySelect.value=value;qualityOptions.forEach((opt)=>{const isSelected=opt===option;opt.classList.toggle('is-selected',isSelected);opt.setAttribute('aria-selected',isSelected?'true':'false');});}});});}
const themeTrigger=modal.querySelector('#portrait-theme-select-trigger',);const themeLabel=modal.querySelector('#portrait-theme-select-label');const themeSelect=modal.querySelector('#portrait-theme-select');const themeOptions=modal.querySelectorAll('.selector-menu[aria-label="Portrait prompt theme"] .selector-option',);if(themeTrigger&&themeLabel&&themeSelect&&themeOptions.length){themeOptions.forEach((option)=>{option.addEventListener('click',(e)=>{e.stopPropagation();const value=option.getAttribute('data-value');const label=option.querySelector('.selector-option-label');if(value&&label){themeLabel.textContent=label.textContent.trim();themeSelect.value=value;themeOptions.forEach((opt)=>{const isSelected=opt===option;opt.classList.toggle('is-selected',isSelected);opt.setAttribute('aria-selected',isSelected?'true':'false');});}});});}},close(){const modal=document.getElementById('settingsModal');if(!modal){if(this._escHandler){document.removeEventListener('keydown',this._escHandler);this._escHandler=null;}
return;}
const content=modal.querySelector('.modal-content')||modal;const handleClose=()=>{if(modal&&modal.parentNode){modal.parentNode.removeChild(modal);}
if(this._escHandler){document.removeEventListener('keydown',this._escHandler);this._escHandler=null;}};if(!modal.classList.contains('closing')){modal.classList.add('closing');}
if(content&&content.addEventListener){content.addEventListener('animationend',handleClose,{once:true});}else{handleClose();}},save(){const narratorSelect=document.getElementById('narrator-select');if(narratorSelect&&window.StorageService&&StorageService.setNarratorId){StorageService.setNarratorId(narratorSelect.value);}
const textSpeedSelect=document.getElementById('text-speed-select');if(textSpeedSelect&&window.StorageService&&StorageService.setTextSpeedMultiplier){StorageService.setTextSpeedMultiplier(textSpeedSelect.value);}
const imageModelSelect=document.getElementById('image-model-select');if(imageModelSelect&&window.StorageService&&StorageService.setImageModel){StorageService.setImageModel(imageModelSelect.value);}
let portraitModeChanged=false;const portraitModeInput=document.querySelector('input[name="portrait-view-mode"]:checked',);if(portraitModeInput&&window.StorageService&&StorageService.setPortraitViewMode){const oldMode=StorageService.getPortraitViewMode?StorageService.getPortraitViewMode():null;const newMode=portraitModeInput.value;if(oldMode!==newMode){portraitModeChanged=true;}
StorageService.setPortraitViewMode(newMode);}
const portraitThemeSelect=document.getElementById('portrait-theme-select');if(portraitThemeSelect&&window.StorageService&&StorageService.setPortraitPromptTheme){StorageService.setPortraitPromptTheme(portraitThemeSelect.value);}
const imageQualitySelect=document.getElementById('image-quality-select');const imageModelForQuality=imageModelSelect?.value;if(imageQualitySelect&&imageModelForQuality&&window.StorageService&&StorageService.setImageQuality){StorageService.setImageQuality(imageModelForQuality,imageQualitySelect.value);}
if(window.App&&typeof App.showToast==='function'){App.showToast('Settings saved');}else if(typeof showNotification==='function'){showNotification('Settings saved');}
this.close();if(portraitModeChanged){if(typeof UI!=='undefined'&&UI&&typeof UI.renderCharacterGrid==='function'){UI.renderCharacterGrid();if(typeof AppState!=='undefined'&&AppState&&AppState.selectedCharacterId){const selectedChar=AppState.filteredCharacters?.find(c=>c&&String(c.id)===String(AppState.selectedCharacterId))||AppState.characters?.find(c=>c&&String(c.id)===String(AppState.selectedCharacterId));if(selectedChar){UI.showCharacterSheet(selectedChar);}}}
if(typeof App!=='undefined'&&App&&typeof CharacterState!=='undefined'){const state=CharacterState.get?CharacterState.get():null;if(state&&state.step==='complete'&&state.character){const panel=document.getElementById('character-panel');if(panel&&typeof Components!=='undefined'&&Components.renderCharacterSheet){panel.innerHTML=Components.renderCharacterSheet(state.character);if(typeof CharacterSheet!=='undefined'&&CharacterSheet.populatePortrait){CharacterSheet.populatePortrait(state.character);}}}}}},});const PORTRAIT_DEBUG_LOG=[];const MAX_PORTRAIT_DEBUG_ENTRIES=100;function logPortraitDebug(action,characterId,characterName,details){if(!window.DEBUG_PORTRAITS)return;const entry={timestamp:new Date().toISOString(),action,characterId,characterName,...details};PORTRAIT_DEBUG_LOG.push(entry);if(PORTRAIT_DEBUG_LOG.length>MAX_PORTRAIT_DEBUG_ENTRIES){PORTRAIT_DEBUG_LOG.shift();}
console.log(`🖼️ [PORTRAIT DEBUG] ${action}`,{characterId,characterName,...details});}
const CharacterSheet=(window.CharacterSheet={dumpPortraitDebugLog(){console.group('🖼️ Portrait Debug Log');console.log('Total entries:',PORTRAIT_DEBUG_LOG.length);console.log('Enable debugging with: window.DEBUG_PORTRAITS = true');console.log('---');PORTRAIT_DEBUG_LOG.forEach((entry,i)=>{console.log(`[${i}] ${entry.timestamp} - ${entry.action}`,entry);});console.groupEnd();return PORTRAIT_DEBUG_LOG;},getPortraitDebugLog(){return[...PORTRAIT_DEBUG_LOG];},clearPortraitDebugLog(){PORTRAIT_DEBUG_LOG.length=0;console.log('🖼️ Portrait debug log cleared');},comparePortraitSources(characterId){const character=window.AppState?.characters?.find(c=>String(c.id)===String(characterId));if(!character){console.error('Character not found:',characterId);return null;}
const result={characterId,characterName:character.name,portraitMetadata:character.portraitMetadata?{activeVersionId:character.portraitMetadata.activeVersionId,versionsCount:character.portraitMetadata.versions?.length||0,versions:character.portraitMetadata.versions?.map(v=>({id:v.id,hasUrl:!!v.url,urlPreview:v.url?v.url.substring(0,80)+'...':null,hasAscii:!!v.ascii,asciiLength:v.ascii?.length||0}))}:null,legacyFields:{customPortraitAscii:character.customPortraitAscii?`[${character.customPortraitAscii.length} chars]`:null,originalPortraitUrl:character.originalPortraitUrl||null,portraitAscii:character.portrait?.ascii?`[${character.portrait.ascii.length} chars]`:null,portraitUrl:character.portrait?.url||null,asciiPortrait:character.asciiPortrait?`[${character.asciiPortrait.length} chars]`:null,asciiPortraitKey:character.asciiPortraitKey||null},resolvedAscii:this.getAsciiPortrait(character)?`[${this.getAsciiPortrait(character).length} chars]`:null,resolvedUrl:this.getOriginalPortraitUrl(character),raceClass:`${character.race}|${character.class}`};console.group(`🖼️ Portrait Sources Comparison: ${character.name}`);console.log('Character ID:',characterId);console.log('Portrait Metadata:',result.portraitMetadata);console.log('Legacy Fields:',result.legacyFields);console.log('Resolved ASCII:',result.resolvedAscii);console.log('Resolved URL:',result.resolvedUrl);console.log('Race|Class Key:',result.raceClass);console.groupEnd();return result;},checkDomMismatch(){const selectedCard=document.querySelector('.character-card.is-selected');const characterSheet=document.getElementById('characterSheet');if(!selectedCard){console.warn('🖼️ No character card is currently selected');return null;}
const characterId=selectedCard.getAttribute('data-id');const character=window.AppState?.characters?.find(c=>String(c.id)===String(characterId));const cardThumb=selectedCard.querySelector('.card-thumbnail');const cardImg=cardThumb?.querySelector('img');const cardAscii=cardThumb?.querySelector('pre');const sheetContainer=characterSheet?.querySelector('.portrait-container');const sheetImg=sheetContainer?.querySelector('.original-portrait');const sheetAscii=sheetContainer?.querySelector('.ascii-portrait pre');const cardInfo={hasImage:!!cardImg,imageUrl:cardImg?.src||null,imageTruncated:cardImg?.src?cardImg.src.substring(0,80)+'...':null,hasAscii:!!cardAscii,asciiLength:cardAscii?.textContent?.length||0,asciiPreview:cardAscii?.textContent?.substring(0,50)+'...'||null,isImageMode:cardThumb?.classList.contains('card-thumbnail--image')||false};const sheetInfo={hasImage:!!sheetImg,imageUrl:sheetImg?.src||null,imageTruncated:sheetImg?.src?sheetImg.src.substring(0,80)+'...':null,imageHidden:sheetImg?.classList.contains('is-hidden')||false,hasAscii:!!sheetAscii,asciiLength:sheetAscii?.textContent?.length||0,asciiPreview:sheetAscii?.textContent?.substring(0,50)+'...'||null,asciiHidden:sheetContainer?.querySelector('.ascii-portrait')?.classList.contains('is-hidden')||false};const urlMismatch=cardInfo.imageUrl!==sheetInfo.imageUrl;const asciiLengthMismatch=cardInfo.asciiLength!==sheetInfo.asciiLength;const result={characterId,characterName:character?.name||'Unknown',card:cardInfo,sheet:sheetInfo,mismatch:{url:urlMismatch,asciiLength:asciiLengthMismatch,summary:urlMismatch||asciiLengthMismatch?'⚠️ MISMATCH DETECTED':'✅ No mismatch'}};console.group(`🖼️ DOM Portrait Check: ${result.characterName}`);console.log('Character ID:',characterId);console.log('Card:',cardInfo);console.log('Sheet:',sheetInfo);console.log('Mismatch:',result.mismatch);if(urlMismatch){console.warn('⚠️ URL MISMATCH: Card and sheet show different images!');console.log('Card URL:',cardInfo.imageUrl);console.log('Sheet URL:',sheetInfo.imageUrl);}
if(asciiLengthMismatch){console.warn('⚠️ ASCII LENGTH MISMATCH: Card and sheet have different ASCII art!');}
console.groupEnd();return result;},enablePortraitDebug(){window.DEBUG_PORTRAITS=true;console.log('🖼️ Portrait debugging ENABLED');console.log('Available commands:');console.log('  CharacterSheet.checkDomMismatch() - Check for visible mismatch');console.log('  CharacterSheet.comparePortraitSources(id) - Compare data sources');console.log('  CharacterSheet.dumpPortraitDebugLog() - Dump all debug entries');console.log('  CharacterSheet.clearPortraitDebugLog() - Clear debug log');console.log('  window.DEBUG_PORTRAITS = false - Disable debugging');},_updateScrollLock(lock){if(lock){document.body.classList.add('selector-menu-open');}else{setTimeout(()=>{const stillOpen=document.querySelectorAll('.selector-shell.is-open');if(stillOpen.length===0){document.body.classList.remove('selector-menu-open');}},0);}},render(character,options={}){const{context='builder',showPortrait=true,onGeneratePortrait=null,onRename=null,onTogglePortrait=null,onLevelChange=null,onPrint=null,onEdit=null,onDuplicate=null,onExport=null,onDelete=null,onShare=null,}=options;const parsed=this._parseCharacterData(character,context);return`
      ${this._renderHeader(character, parsed, context, {
        onPrint,
        onRename,
        onDuplicate,
        onExport,
        onDelete,
        onLevelChange,
        onEdit,
        onGeneratePortrait,
        onTogglePortrait,
        onShare,
      })}
      
      ${showPortrait
        ? this._renderPortrait(character, parsed, context, {
            onGeneratePortrait,
            onTogglePortrait,
          })
        : ''}
      
      ${this._renderBasicInfo(parsed, context, {})}
      
      ${parsed.hasCombatStats ? this._renderCombatStats(parsed, context) : ''}
      
      ${parsed.hasAbilities ? this._renderAbilities(parsed, context) : ''}
      
      ${parsed.hasSavingThrows ? this._renderSavingThrows(parsed) : ''}
      
      ${parsed.hasSkills ? this._renderSkills(parsed) : ''}
      
      ${parsed.hasSpells ? this._renderSpells(parsed) : ''}
      
      ${parsed.hasRacialTraits ? this._renderRacialTraits(parsed) : ''}
      
      ${parsed.hasEquipment ? this._renderEquipment(parsed) : ''}
      
      ${parsed.hasToolProficiencies
        ? this._renderToolProficiencies(parsed)
        : ''}
      
      ${parsed.hasLanguages ? this._renderLanguages(parsed) : ''}
      
      ${parsed.hasBackgroundFeature
        ? this._renderBackgroundFeature(parsed)
        : ''}
      
      ${parsed.hasBackstory ? this._renderBackstory(parsed) : ''}
      
      ${context === 'manager' && parsed.hasExportInfo
        ? this._renderExportInfo(character)
        : ''}
    `;},_renderHeader(character,parsed,context,callbacks){const{onPrint,onRename,onDuplicate,onExport,onDelete,onLevelChange,onEdit,onGeneratePortrait,onTogglePortrait,onShare,}=callbacks;const renameFn=context==='builder'?'App.openNameModal()':`renameCharacter('${character.id}')`;const editFn=context==='manager'?`editCharacter('${character.id}')`:null;const printFn=onPrint&&context==='builder'?'App.printCharacterSheet()':onPrint&&context==='manager'?'printCharacterSheet()':null;const headerActions=[];let deleteAction=null;if(character.name&&onRename&&context==='builder'){headerActions.push({icon:'✎',label:'Rename',onclick:renameFn,});}
if(context==='builder'&&onLevelChange){headerActions.push({icon:'↕',label:'Change level',onclick:'App.openLevelModal()',});}
if(context==='manager'&&onDelete){deleteAction={icon:'×',label:'Delete character',onclick:`deleteCharacter('${character.id}')`,};}
const hasValidManagerId=!!character.id;const generateFn=context==='builder'?'App.generateCustomAIPortrait()':hasValidManagerId?`generatePortraitForCharacter('${character.id}')`:null;const hasCustomPortrait=!!(character.customPortraitAscii||character.originalPortraitUrl||character.portrait?.url||(character.portraitMetadata&&Array.isArray(character.portraitMetadata.versions)&&character.portraitMetadata.versions.length>0));const historyFn=context==='builder'?'App.openPortraitHistory()':hasValidManagerId?`openPortraitHistory('${character.id}')`:null;if(parsed.hasRace&&parsed.hasClass&&onGeneratePortrait&&(context==='builder'||hasValidManagerId)&&generateFn){const imageQuotaRemaining=window._imageQuotaRemaining;const imageQuotaExhausted=typeof imageQuotaRemaining==='number'&&imageQuotaRemaining===0;let imageQuotaTooltip='';if(imageQuotaExhausted){imageQuotaTooltip='Daily limit reached';}else if(typeof imageQuotaRemaining==='number'){if(imageQuotaRemaining===0){imageQuotaTooltip='Daily limit reached';}else if(imageQuotaRemaining>0){imageQuotaTooltip=`${imageQuotaRemaining}${' '}portrait${imageQuotaRemaining === 1 ? '' : 's'}${' '}remaining`;}}
headerActions.push({icon:'★',label:'Customize portrait',onclick:generateFn,disabled:imageQuotaExhausted,title:imageQuotaTooltip,});}
if(hasCustomPortrait&&historyFn){headerActions.push({icon:'⧖',label:'Portrait history',onclick:historyFn,});}
if(context==='manager'&&onShare&&hasValidManagerId){headerActions.push({icon:'↗',label:'Share character',onclick:`openShareModal('${character.id}')`,});}
if(printFn){headerActions.push({icon:'⎙',label:'Print sheet',onclick:printFn,});}
if(context==='manager'&&onEdit&&editFn){headerActions.unshift({icon:'✎',label:'Edit character',onclick:editFn,id:'sheet-edit-overflow',});}
if(deleteAction){headerActions.push(deleteAction);}
const editButtonHtml=context==='manager'&&onEdit&&editFn?`
        <button
          class="terminal-btn-small sheet-edit-btn"
          type="button"
          onclick="${editFn}"
        >
          ✎ Edit
        </button>
      `:'';const headerMenu=headerActions.length>0?`
        <div class="sheet-title-buttons selector-shell selector-shell--actions">
          <button
            class="terminal-btn-small selector-trigger sheet-actions-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label="More actions"
            onclick="CharacterSheet.toggleSelectorMenu(this)"
          >
            <span class="sheet-actions-icon" aria-hidden="true">
              <span class="sheet-actions-dot dot-1"></span>
              <span class="sheet-actions-dot dot-2"></span>
              <span class="sheet-actions-dot dot-3"></span>
            </span>
          </button>
          <div class="selector-menu sheet-actions-menu" role="menu" aria-hidden="true">
            ${headerActions
              .map(
                (action) => {
                  const btnHtml = `<button
class="selector-option${action.disabled ? ' is-disabled' : ''}"
type="button"
role="menuitem"
${action.disabled?'disabled':`onclick="${action.onclick}"`}${action.id?` id="${action.id}"`:''}><span class="selector-option-icon">${action.icon}</span><span class="selector-option-label">${action.label}</span></button>`;
                  // Wrap with custom tooltip if action has a title
                  if (action.title) {
                    return `<span class="has-tooltip selector-option-wrapper">${btnHtml}<span class="custom-tooltip"${' '}data-position="bottom">${action.title}</span></span>`;
                  }
                  return btnHtml;
                },
              )
              .join('')}
          </div>
        </div>
      `:'';const actionsBlock=editButtonHtml||headerMenu?`
        <div class="sheet-title-actions">
          ${editButtonHtml}
          ${headerMenu}
        </div>
      `:'';const safeTitle=character.name&&typeof character.name==='string'?this.escapeHtml(character.name):'[ CHARACTER SHEET ]';return`
      <div class="sheet-title-header">
        <div class="sheet-title">${safeTitle}</div>
        ${actionsBlock}
      </div>
    `;},_renderPortrait(character,parsed,context,callbacks){const{onGeneratePortrait,onTogglePortrait}=callbacks;const isDemo=window.DemoCharacters&&window.DemoCharacters.isDemo(character);const asciiPortrait=this.getAsciiPortrait(character);const originalPortraitUrl=this.getOriginalPortraitUrl(character);logPortraitDebug('renderPortrait (sheet)',character.id,character.name,{context,hasAscii:!!asciiPortrait,asciiLength:asciiPortrait?.length||0,url:originalPortraitUrl,portraitMetadataActiveId:character.portraitMetadata?.activeVersionId||null,portraitMetadataVersionsCount:character.portraitMetadata?.versions?.length||0});let portraitViewMode='original';try{if(window.StorageService&&StorageService.getPortraitViewMode){portraitViewMode=StorageService.getPortraitViewMode();}else if(typeof CONFIG!=='undefined'&&CONFIG.DEFAULT_PORTRAIT_VIEW_MODE){portraitViewMode=CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;}}catch(e){}
const safeIdForDom=character.id||'current';const portraitId=context==='builder'?'character-portrait':`character-portrait-${safeIdForDom}`;const originalPortraitId=context==='builder'?'original-portrait':`original-portrait-${safeIdForDom}`;const needsPlaceholder=!asciiPortrait&&!originalPortraitUrl;const showOriginalByDefault=!!originalPortraitUrl&&portraitViewMode==='original'&&!needsPlaceholder;const demoTagHtml=isDemo?'<span class="sheet-demo-tag">SAMPLE</span>':'';return`
      <div class="portrait-container${showOriginalByDefault ? ' portrait-container--original-mode' : ''}">
        ${demoTagHtml}
        <div class="ascii-portrait ${needsPlaceholder ? 'ascii-portrait--placeholder' : ''} ${showOriginalByDefault ? 'is-hidden' : ''}" id="${portraitId}">
          ${needsPlaceholder ? `<div class="portrait-placeholder-content"><div class="portrait-placeholder-cube-container"><div class="portrait-placeholder-cube"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="portrait-placeholder-text">Waiting for character data…</div></div>` : ''}
        </div>
        ${originalPortraitUrl
          ? `<img id="${originalPortraitId}"class="original-portrait${showOriginalByDefault ? '' : ' is-hidden'}"src="${originalPortraitUrl}"alt="Character portrait"onload="this.classList.add('is-loaded')">`
          : ''}
      </div>
    `;},_renderBasicInfo(parsed,context,callbacks){const isBuilder=context==='builder';const race=parsed.raceName?this.escapeHtml(this.toSentenceCase(parsed.raceName)):'';const cls=parsed.className?this.escapeHtml(this.toSentenceCase(parsed.className)):'';const background=parsed.backgroundName?this.escapeHtml(this.toSentenceCase(parsed.backgroundName)):'';const alignment=parsed.alignment?this.escapeHtml(this.toSentenceCase(this.formatAlignment(parsed.alignment)),):'';const sex=parsed.sex?this.escapeHtml(this.toSentenceCase(parsed.sex)):'';return`
      <div class="sheet-section">
        <div class="sheet-header"></div>
        <div class="sheet-content">
          ${
            isBuilder || race
              ? `<div class="stat-line"><span class="stat-label">Race:</span><span class="stat-value">${race||'—'}</span></div>`
              : ''
          }
          ${
            isBuilder || cls
              ? `<div class="stat-line"><span class="stat-label">Class:</span><span class="stat-value">${cls||'—'}</span></div>`
              : ''
          }
          ${
            isBuilder || background
              ? `<div class="stat-line"><span class="stat-label">Background:</span><span class="stat-value">${background||'—'}</span></div>`
              : ''
          }
          ${
            isBuilder || alignment
              ? `<div class="stat-line"><span class="stat-label">Alignment:</span><span class="stat-value">${alignment||'—'}</span></div>`
              : ''
          }
          <div class="stat-line"><span class="stat-label">Sex:</span> <span class="stat-value">${sex || '—'}</span></div>
          <div class="stat-line">
            <span class="stat-label">Level:</span>
            <span class="stat-value">${parsed.level}</span>
          </div>
        </div>
      </div>
    `;},_renderCombatStats(parsed,context){const headerClass=context==='builder'?'sheet-header sheet-header--no-divider':'sheet-header';const isBuilder=context==='builder';const hasCombatStats=parsed.hpMax>0;return`
      <div class="sheet-section">
        <div class="${headerClass}">
          <div class="sheet-header-title">[ COMBAT STATS ]</div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-box-label">HIT POINTS</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `${parsed.hpCurrent}/ ${parsed.hpMax}`}</div></div><div class="stat-box"><div class="stat-box-label">ARMOR CLASS</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':parsed.armorClass}</div></div><div class="stat-box"><div class="stat-box-label">INITIATIVE</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':this.formatModifier(parsed.initiative)}</div></div><div class="stat-box"><div class="stat-box-label">SPEED</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`${parsed.speed} ft`}</div></div><div class="stat-box"><div class="stat-box-label">PROF BONUS</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`+${parsed.proficiencyBonus}`}</div></div><div class="stat-box"><div class="stat-box-label">HIT DIE</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`d${parsed.hitDie}`}</div></div></div></div>`;
  },

  _renderAbilities(parsed, context) {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    const headerClass =
      context === 'builder'
        ? 'sheet-header sheet-header--no-divider'
        : 'sheet-header';

    // Use grid layout for both contexts (identical formatting)
    return `<div class="sheet-section"><div class="${headerClass}"><div class="sheet-header-title">[ABILITY SCORES]</div></div><div class="ability-grid">${abilities.map((ability)=>{if(!parsed.abilitiesSet){return`
                  <div class="ability-box">
                    <div class="ability-name">${ability.toUpperCase()}</div>
                    <div class="ability-score">— <span class="ability-modifier">(—)</span></div>
                  </div>
                `;}
const score=parsed.abilities[ability]||10;const modifier=parsed.abilityModifiers[ability]!==undefined?parsed.abilityModifiers[ability]:Math.floor((score-10)/2);return`
                <div class="ability-box">
                  <div class="ability-name">${ability.toUpperCase()}</div>
                  <div class="ability-score">${score} <span class="ability-modifier">(${this.formatModifier(modifier)})</span></div>
                </div>
              `;}).join('')}</div></div>`;
  },

  /**
   * Generic toggle for selector-style overflow menus used in the sheet header
   * and portrait actions. Attaches to the nearest `.selector-shell` and
   * uses shared `.selector-menu` styles/animation.
   * @param {HTMLElement} triggerEl
   */
  toggleSelectorMenu(triggerEl) {
    if (!triggerEl) return;
    const shell = triggerEl.closest('.selector-shell');
    if (!shell) return;
    // Use detached menu if present (portrait history), otherwise fall back
    // to the inline selector-menu element so toggling works in both cases.
    const menu = shell._detachedMenu || shell.querySelector('.selector-menu');
    if (!menu) return;

    const isOpen = shell.classList.contains('is-open');

    // Helper to close a given selector shell and restore any detached menu.
    // Also ensures focus is never left inside a menu that has aria-hidden="true"
    // to avoid accessibility violations in modern browsers.
    const closeShell = (openShell) => {
      if (!openShell) return;
      const btn = openShell.querySelector('.selector-trigger');
      const m = openShell._detachedMenu || openShell.querySelector('.selector-menu');
      if (!btn || !m) return;

      // If focus is currently inside the menu we're about to hide, move it
      // back to the trigger first so that no focused element is inside an
      // aria-hidden subtree. This prevents warnings like:
      // "Blocked aria-hidden on an element because its descendant retained focus."
      try {
        const activeEl = document.activeElement;
        if (activeEl && m.contains(activeEl)) {
          btn.focus();
        }
      } catch (e) {
        // Non-fatal; if anything goes wrong, continue closing the shell.
      }

      // Trigger close animation first
      btn.classList.remove('is-open');
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      openShell.classList.remove('is-open');
      
      // Unlock scroll when menu closes
      CharacterSheet._updateScrollLock(false);

      // Restore menu to original parent AFTER the close animation completes
      // to prevent visual jumping. The CSS transition is ~200ms.
      if (m._originalParent) {
        const originalParent = m._originalParent;
        const detachedMenu = openShell._detachedMenu;
        // Clear references immediately to prevent double-restore
        delete m._originalParent;
        delete openShell._detachedMenu;

        setTimeout(() => {
          m.classList.remove('portrait-history-menu-detached');
          m.classList.remove('portrait-history-menu-detached--teal');
          m.classList.remove('selector-menu-detached');
          // Clear inline styles that were set for fixed positioning
          m.style.position = '';
          m.style.top = '';
          m.style.left = '';
          m.style.width = '';
          m.style.minWidth = '';
          m.style.maxWidth = '';
          m.style.maxHeight = '';
          originalParent.appendChild(m);
        }, 200);
      }
    };

    // Close all other open menus first (only one menu open at a time)
    if (!isOpen) {
      const openShells = document.querySelectorAll('.selector-shell.is-open');
      openShells.forEach((openShell) => {
        if (openShell === shell) return; // skip the one we're about to open
        closeShell(openShell);
      });
    }

    const setOpen = (open) => {
      if (open) {
        // Check if trigger is inside any modal (portrait history, settings, etc.)
        const inModal = !!triggerEl.closest('.modal');
        const inPortraitModal = !!triggerEl.closest('.portrait-history-modal');

        // Move menu outside modal ancestors to prevent:
        // 1. overflow:hidden clipping
        // 2. CSS transform creating a new containing block (breaks fixed positioning)
        // This applies to ALL modals, not just portrait-history.
        if (inModal) {
          menu._originalParent = menu.parentElement;
          // Store reference in shell so handlers can find the menu later
          shell._detachedMenu = menu;

          // Add theming class based on modal type
          if (inPortraitModal) {
            menu.classList.add('portrait-history-menu-detached');
            // If the trigger lives inside a focused/selected history card, also
            // opt the detached menu into the teal theme so it matches the card.
            const card = triggerEl.closest('.character-card');
            const isTealCard =
              card &&
              (card.classList.contains('is-selected') ||
                card.classList.contains('is-keyboard-focused'));
            if (isTealCard) {
              menu.classList.add('portrait-history-menu-detached--teal');
            } else {
              menu.classList.remove('portrait-history-menu-detached--teal');
            }
          } else {
            // For other modals (settings, etc.), add a generic detached class
            menu.classList.add('selector-menu-detached');
          }

          document.body.appendChild(menu);
        }

        try {
          const shellRect = shell.getBoundingClientRect();
          const triggerRect = triggerEl.getBoundingClientRect();
          const viewportWidth = window.innerWidth;

          // Decide whether to use viewport-based fixed positioning or local
          // absolute positioning relative to the selector shell.
          //
          // RULE: Always use fixed positioning so menus can escape overflow
          // containers (e.g. terminal-container with overflow:hidden).
          // EXCEPTION: Search/sort bar and header overflow use absolute positioning
          // so the dropdown stays anchored to its button during page scroll.
          const inSearchActions = !!triggerEl.closest('.search-actions');
          const inHeaderOverflow = !!triggerEl.closest('.header-overflow');
          const useFixedPositioning = !inSearchActions && !inHeaderOverflow;

          // Measure menu size without affecting final animation. Temporarily
          // neutralize transforms so we get the *full* height instead of the
          // scaled (collapsed) height from CSS.
          const prevDisplay = menu.style.display;
          const prevVisibility = menu.style.visibility;
          const prevTransform = menu.style.transform;

          // Clear any previous inline sizing from earlier openings so we always
          // measure from a clean baseline. Use fixed/absolute positioning during
          // measurement so getBoundingClientRect returns consistent values.
          menu.style.maxHeight = '';
          menu.style.position = useFixedPositioning ? 'fixed' : 'absolute';
          menu.style.top = '0';
          menu.style.left = '0';
          menu.style.visibility = 'hidden';
          menu.style.display = 'block';
          menu.style.transform = 'none';

          const menuRect = menu.getBoundingClientRect();
          let menuHeight = menuRect.height || 0;
          let menuWidth = menuRect.width || 0;

          // Ensure the listbox width works well relative to its trigger.
          // - For most selectors, we only guarantee the menu is at least as wide
          //   as the trigger so wide buttons don't "overhang" a narrow menu.
          // - For special cases (like the narrator selector in settings), we can
          //   force the menu to *exactly* match the trigger width by adding
          //   `.selector-shell--match-width` to the shell.
          const triggerWidth = triggerRect.width || 0;
          const menuMaxWidth = 360; // matches .selector-menu max-width in CSS
          const minMenuWidth = 200; // keep in sync with .selector-menu min-width
          const forceMatchWidth = shell.classList.contains('selector-shell--match-width');

          if (triggerWidth > 0) {
            if (forceMatchWidth) {
              // For match-width shells (like narrator voice/text speed in settings),
              // force the menu to match the trigger width but never drop below the
              // global 200px min-width so very small triggers still get a readable menu.
              const targetWidth = Math.max(triggerWidth, minMenuWidth);
              menu.style.width = `${targetWidth}px`;
              menu.style.minWidth = `${targetWidth}px`;
              menu.style.maxWidth = `${targetWidth}px`;
              const remeasureRect = menu.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            } else if (triggerWidth <= menuMaxWidth && menuWidth < triggerWidth) {
              // Default behavior: ensure the menu is at least as wide as the trigger,
              // but don't exceed the global max width.
              menu.style.minWidth = `${triggerWidth}px`;
              const remeasureRect = menu.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            }
          }

          menu.style.display = prevDisplay;
          menu.style.visibility = prevVisibility;
          menu.style.transform = prevTransform;

          // Shared vertical positioning logic (decide whether to open above/below)
          const viewportHeight = window.innerHeight;
          const padding = 8; // breathing room from host edges
          const gapY = 4; // small gap between trigger and menu

          // Determine the bounding container for the menu:
          // - In a modal: use the modal-body bounds (so menu stays within modal content area)
          // - Not in a modal: use the terminal frame bounds
          // This ensures menus are visually contained within their logical parent.
          //
          // NOTE: We use .modal-body (not .modal-content) because modals with
          // overflow:visible would give us incorrect bounds when the menu overflows.
          let host;
          let hostBottom;
          let hostTop;
          const verticalSafeMargin = 12;

          if (inModal) {
            // For modals, find the modal-body as the content area constraint.
            // Also check for modal-footer to ensure we don't overlap it.
            const modalContent = triggerEl.closest('.modal-content');
            const modalBody = triggerEl.closest('.modal-body');
            const modalFooter = modalContent?.querySelector('.modal-footer');

            if (modalBody) {
              const bodyRect = modalBody.getBoundingClientRect();
              hostTop = bodyRect.top + padding;
              hostBottom = bodyRect.bottom - padding;
            } else if (modalContent) {
              const contentRect = modalContent.getBoundingClientRect();
              hostTop = contentRect.top + padding + verticalSafeMargin;
              hostBottom = contentRect.bottom - padding - verticalSafeMargin;
            } else {
              // Fallback to terminal frame
              host = triggerEl.closest('.terminal-frame, .terminal-container') || document.documentElement;
              const hostRect = host.getBoundingClientRect();
              hostTop = hostRect.top + padding + verticalSafeMargin;
              hostBottom = hostRect.bottom - padding - verticalSafeMargin;
            }

            // If there's a modal footer, ensure we don't extend past it
            if (modalFooter) {
              const footerRect = modalFooter.getBoundingClientRect();
              hostBottom = Math.min(hostBottom, footerRect.top - padding);
            }
          } else {
            host =
              triggerEl.closest('.terminal-frame, .terminal-container') ||
              document.documentElement;
            const hostRect = host.getBoundingClientRect();
            hostTop = hostRect.top + padding + verticalSafeMargin;
            hostBottom = hostRect.bottom - padding - verticalSafeMargin;
          }

          // Calculate available space above and below trigger within the host
          const spaceAbove = triggerRect.top - hostTop;
          const spaceBelow = hostBottom - triggerRect.bottom;

          // Determine if menu fits in each direction
          const fitsBelow = spaceBelow >= menuHeight + gapY;
          const fitsAbove = spaceAbove >= menuHeight + gapY;

          // Choose direction: prefer below for top-half triggers, above for bottom-half.
          // For match-width shells (like settings), we prefer below if both fit.
          const triggerCenterY = triggerRect.top + triggerRect.height / 2;
          const inTopHalf = triggerCenterY < viewportHeight / 2;

          let openBelow;
          if (fitsBelow && fitsAbove) {
            // Both fit: use viewport half as hint, but prefer below for match-width
            openBelow = forceMatchWidth ? true : inTopHalf;
          } else if (fitsBelow) {
            openBelow = true;
          } else if (fitsAbove) {
            openBelow = false;
          } else {
            // Neither fits perfectly: use the side with more space
            openBelow = spaceBelow >= spaceAbove;
          }

          if (useFixedPositioning) {
            // ===== Host-based fixed positioning (non-modal + portrait history) =====

            // Calculate available space in each direction BEFORE positioning.
            // This ensures we use the full available space, not just the
            // measured menu height (which might be pre-constrained by CSS).
            const spaceAboveTrigger = triggerRect.top - gapY - hostTop;
            const spaceBelowTrigger = hostBottom - triggerRect.bottom - gapY;

            let top;
            let availableHeight;

            menu.style.position = 'fixed';

            if (openBelow) {
              // Open below: anchor menu at its top edge, just under trigger
              const top = triggerRect.bottom + gapY;
              availableHeight = hostBottom - top;
              
              menu.style.top = `${top}px`;
              menu.style.bottom = 'auto';
            } else {
              // Open above: anchor menu at its BOTTOM edge, just above trigger.
              // This lets the menu "grow upward" naturally.
              const menuBottom = window.innerHeight - (triggerRect.top - gapY);
              availableHeight = spaceAboveTrigger;
              
              menu.style.top = 'auto';
              menu.style.bottom = `${menuBottom}px`;
            }

            // Set max-height to constrain within bounds (enables scrolling if needed)
            if (availableHeight > 0) {
              menu.style.maxHeight = `${availableHeight}px`;
              menu.style.overflowY = 'auto';
            }

            // Horizontal offset: keep menus inside the host frame. For the
            // portrait history modal specifically, open the menu to the *side*
            // of the card so it doesn't obscure the three-dot trigger; for all
            // other hosts fall back to the standard behavior.
            //
            // For horizontal bounds, we use the modal-content (not modal-body)
            // since we want the full width of the modal dialog.
            let hostLeft, hostRight;
            if (inModal) {
              const modalContent = triggerEl.closest('.modal-content');
              if (modalContent) {
                const contentRect = modalContent.getBoundingClientRect();
                hostLeft = contentRect.left + padding;
                hostRight = contentRect.right - padding;
              } else {
                // Fallback
                hostLeft = padding;
                hostRight = viewportWidth - padding;
              }
            } else if (host) {
              const hostRect = host.getBoundingClientRect();
              hostLeft = hostRect.left + padding;
              hostRight = hostRect.right - padding;
            } else {
              hostLeft = padding;
              hostRight = viewportWidth - padding;
            }

            let targetLeft;
            if (inPortraitModal) {
              const sideGapX = 8;
              const spaceRight = hostRight - triggerRect.right;
              const spaceLeft = triggerRect.left - hostLeft;
              const openRight = spaceRight >= spaceLeft;

              if (openRight && spaceRight >= menuWidth + sideGapX) {
                // Place menu to the right of the trigger/card
                targetLeft = triggerRect.right + sideGapX;
              } else {
                // Place menu to the left of the trigger/card
                targetLeft = triggerRect.left - sideGapX - menuWidth;
              }

              // Clamp within host bounds
              if (targetLeft < hostLeft) {
                targetLeft = hostLeft;
              }
              if (targetLeft + menuWidth > hostRight) {
                targetLeft = Math.max(hostLeft, hostRight - menuWidth);
              }
            } else {
              const minLeft = hostLeft;
              const maxLeft = Math.max(minLeft, hostRight - menuWidth);

              const fitsRight =
                triggerRect.left + menuWidth <= hostRight;
              const fitsLeft =
                triggerRect.right - menuWidth >= hostLeft;

              if (fitsRight && !fitsLeft) {
                // Enough room to the right but not to the left: open to the right.
                targetLeft = triggerRect.left;
              } else if (!fitsRight && fitsLeft) {
                // Not enough room to the right but enough to the left: right-align
                // menu with trigger so it grows back to the left.
                targetLeft = triggerRect.right - menuWidth;
              } else {
                // Both sides viable or both tight: start with left-aligned and then
                // clamp within host padding.
                targetLeft = triggerRect.left;
              }

              // Clamp horizontal position so the menu stays within host padding.
              if (targetLeft < minLeft) {
                targetLeft = minLeft;
              }
              if (targetLeft > maxLeft) {
                targetLeft = maxLeft;
              }
            }

            menu.style.left = `${targetLeft}px`;
            menu.style.right = 'auto';
            // Ensure the menu appears above modals and other content.
            // Modal overlay is z-index: 10000, so detached menus need to be above that.
            menu.style.zIndex = inModal ? '10001' : '1000';
          } else {
            // ===== Local absolute positioning (search/sort bar only) =====
            // The search bar needs absolute positioning so dropdown stays
            // anchored to its button during page scroll.

            menu.style.position = 'absolute';

            // Compute desired top in viewport space, clamped within the host,
            // then convert to shell-relative coordinates for absolute positioning.
            const maxTopViewport = hostBottom - menuHeight;
            let topViewport;

            if (openBelow) {
              topViewport = triggerRect.bottom + gapY;
              if (topViewport > maxTopViewport) {
                topViewport = Math.max(hostTop, maxTopViewport);
              }
            } else {
              topViewport = triggerRect.top - gapY - menuHeight;
              if (topViewport < hostTop) {
                topViewport = hostTop;
              }
            }

            const top = topViewport - shellRect.top;
            menu.style.top = `${top}px`;
            menu.style.bottom = 'auto';

            // Horizontal positioning for absolute menus
            if (inHeaderOverflow) {
              // Header overflow: right-align menu with trigger (opens leftward)
              const right = shellRect.right - triggerRect.right;
              menu.style.left = 'auto';
              menu.style.right = `${right}px`;
            } else {
              // Default: align left edge of menu with left edge of trigger.
              const left = triggerRect.left - shellRect.left;
              menu.style.left = `${left}px`;
              menu.style.right = 'auto';
            }

            // Cap height so long menus scroll instead of clipping.
            let availableHeight = hostBottom - topViewport;
            if (!openBelow) {
              availableHeight = Math.min(
                availableHeight,
                triggerRect.top - gapY - topViewport,
              );
            }

            if (menuHeight > availableHeight && availableHeight > 0) {
              menu.style.maxHeight = `${availableHeight}px`;
              menu.style.overflowY = 'auto';
            } else {
              menu.style.maxHeight = '';
              menu.style.overflowY = '';
            }

            menu.style.zIndex = '1000';
          }
        } catch (err) {
          // In case anything above fails (e.g., unexpected DOM state), fall back
          // to a very simple "open below trigger" layout so the menu still opens.
          menu.style.position = 'absolute';
          menu.style.top = `${triggerEl.offsetHeight+4}px`;
          menu.style.left = '0';
          menu.style.right = 'auto';
          menu.style.maxHeight = '';
          menu.style.overflowY = '';
          // Modal overlay is z-index: 10000, so detached menus need to be above that.
          menu.style.zIndex = inModal ? '10001' : '1000';
        }

        shell.classList.add('is-open');
        triggerEl.classList.add('is-open');
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        triggerEl.setAttribute('aria-expanded', 'true');
        
        // Lock scroll when menu opens
        CharacterSheet._updateScrollLock(true);

        // Focus behavior differs by menu type:
        // - Listbox (--listbox): Focus the selected option for keyboard nav
        // - Actions (--actions): No focus, just show the menu
        const isActionsMenu = shell.classList.contains('selector-shell--actions');
        
        if (!isActionsMenu) {
          // Listbox: focus the selected option (or first if none selected)
          const selectedOption =
            menu.querySelector('.selector-option[aria-selected="true"]') ||
            menu.querySelector('.selector-option.is-selected') ||
            menu.querySelector('.selector-option');
          if (selectedOption) {
            selectedOption.focus();
          }
        }
      } else {
        closeShell(shell);
      }
    };

    setOpen(!isOpen);

    if (!this._selectorOutsideHandler) {
      this._selectorOutsideHandler = (event) => {
        // Small delay to let the toggle complete first
        setTimeout(() => {
          const openShells = document.querySelectorAll('.selector-shell.is-open');
          if (!openShells.length) return;
          // Don't close if clicking trigger (let toggle handle it), inside menu, or inside another shell
          const clickedTrigger = event.target.closest('.selector-trigger');
          const clickedMenu = event.target.closest('.selector-menu');
          const clickedShell = event.target.closest('.selector-shell');
          
          if (clickedTrigger || clickedMenu || clickedShell) return;
          
          openShells.forEach((openShell) => {
            closeShell(openShell);
          });
        }, 0);
      };
      // Use capture phase to catch clicks before stopPropagation in modals
      document.addEventListener('click', this._selectorOutsideHandler, true);
    }

    if (!this._selectorKeyHandler) {
      this._selectorKeyHandler = (event) => {
        if (event.key !== 'Escape') return;
        const openShells = document.querySelectorAll('.selector-shell.is-open');
        if (!openShells.length) return;
        openShells.forEach((openShell) => {
          const btn = openShell.querySelector('.selector-trigger');
          // Check for detached menu first, fall back to querySelector
          const m = openShell._detachedMenu || openShell.querySelector('.selector-menu');
          if (!btn || !m) return;
          closeShell(openShell);
          btn.focus();
        });
      };
      document.addEventListener('keydown', this._selectorKeyHandler);
    }

    // Close selector menus when an option is activated (click inside the menu)
    if (!this._selectorOptionHandler) {
      this._selectorOptionHandler = (event) => {
        const option = event.target.closest('.selector-option');
        if (!option) return;
        // First, try to find the shell in the normal DOM tree
        let shell = option.closest('.selector-shell');

        // If the menu has been detached to <body> (portrait history modal),
        // walk up to the selector-menu and use its original parent as shell.
        if (!shell) {
          const menuEl = option.closest('.selector-menu');
          if (menuEl && menuEl._originalParent) {
            shell = menuEl._originalParent;
          }
        }

        if (!shell || !shell.classList.contains('is-open')) return;
        closeShell(shell);
      };
      // Use capture so this still fires even if option handlers stopPropagation
      document.addEventListener('click', this._selectorOptionHandler, true);
    }
  },

  _renderSavingThrows(parsed) {
    if (!parsed.savingThrowModifiers) return '';

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[SAVING THROWS]</div></div><div class="sheet-content">${Object.entries(parsed.savingThrowModifiers).map(([ability,value])=>{const isProficient=parsed.savingThrows?.includes(ability);return`
                <div class="stat-line">
                  <span class="stat-label">${ability.toUpperCase()}:</span>
                  <span class="stat-value">${this.formatModifier(value)}${isProficient ? ' ★' : ''}</span>
                </div>
              `;}).join('')}</div></div>`;
  },

  _renderSkills(parsed) {
    const hasSkillModifiers =
      parsed.skillModifiers && Object.keys(parsed.skillModifiers).length > 0;
    const hasSkillProfs =
      parsed.skillProficiencies && parsed.skillProficiencies.length > 0;

    if (!hasSkillModifiers && !hasSkillProfs) return '';

    // When we have both full skill modifiers and an explicit list of
    // proficiencies (e.g. edited in manager), show the numeric skills first
    // and then any *extra* proficiencies as a simple bullet list.
    const modifierKeys = hasSkillModifiers
      ? Object.keys(parsed.skillModifiers)
      : [];

    const extraProfs =
      hasSkillProfs && modifierKeys.length
        ? parsed.skillProficiencies.filter(
            (skill) => !modifierKeys.includes(skill),
          )
        : parsed.skillProficiencies || [];

    const skillsMarkup = hasSkillModifiers
      ? Object.entries(parsed.skillModifiers)
          .map(
            ([skill, value]) => `<div class="stat-line"><span class="stat-label">${this.escapeHtml(this.formatSkillName(skill),)}:</span><span class="stat-value">${this.formatModifier(value)}★</span></div>`,
          )
          .join('')
      : '';

    const extraProfsMarkup =
      extraProfs && extraProfs.length
        ? extraProfs
            .map((skill) => {
              const label = this.escapeHtml(this.formatSkillName(skill));
              return `<div class="text-dim">• ${label}</div>`;
            })
            .join('')
        : '';

    const headerTitle = hasSkillModifiers
      ? 'SKILLS'
      : 'SKILL PROFICIENCIES';

    let contentMarkup;
    if (skillsMarkup && extraProfsMarkup) {
      contentMarkup = `
${skillsMarkup}<div class="sheet-divider"></div>${extraProfsMarkup}`;
    } else {
      contentMarkup = skillsMarkup || extraProfsMarkup;
    }

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[${headerTitle}]</div></div><div class="sheet-content">${contentMarkup}</div></div>`;
  },

  _renderSpells(parsed) {
    const cantrips = parsed.cantrips || [];
    const spellsKnown = parsed.spellsKnown || [];
    const spellsPrepared = parsed.spellsPrepared || [];
    const spellSlots = parsed.spellSlots || {};

    // Helper to render spell list
    const renderSpellList = (spells) => {
      return spells
        .map((spell) => {
          const rawName = spell && typeof spell === 'object' ? spell.name : spell;
          const name = this.escapeHtml(rawName || '');
          const school =
            spell && spell.school
              ? `<span class="text-dim">(${this.escapeHtml(spell.school,)})</span>`
              : '';
          const desc =
            spell && spell.description
              ? `<div class="text-dim terminal-text-small spell-list-description">${this.escapeHtml(spell.description,)}</div>`
              : '';
        return `<div class="text-dim spell-list-item">• ${name}${school}</div>${desc}`;
        })
        .join('');
    };

    let spellsContent = '';

    // Cantrips
    if (cantrips.length > 0) {
      spellsContent += `<div class="sheet-subsection"><div class="sheet-subsection-title">CANTRIPS(At-Will)</div>${renderSpellList(cantrips)}</div>`;
    }

    // 1st Level Spells
    if (spellsKnown.length > 0 || spellsPrepared.length > 0) {
      const spellList = spellsKnown.length > 0 ? spellsKnown : spellsPrepared;
      const slotsText = spellSlots['1'] ? `• Slots:${spellSlots['1']}` : '';
      const preparedText = spellsPrepared.length > 0 && spellsKnown.length === 0 ? ' (Prepared)' : '';
      
      spellsContent += `<div class="sheet-subsection"><div class="sheet-subsection-title">1ST LEVEL${preparedText}${slotsText}</div>${renderSpellList(spellList)}</div>`;
    }

    // Spellcasting ability note
      if (parsed.spellcastingAbility) {
      const abilityName = {
        int: 'Intelligence',
        wis: 'Wisdom',
        cha: 'Charisma',
      }[parsed.spellcastingAbility] || parsed.spellcastingAbility;
      
      spellsContent += `<div class="text-dim terminal-text-small spellcasting-ability-note">Spellcasting Ability:${this.escapeHtml(abilityName)}</div>`;
    }

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[SPELLS]</div></div><div class="sheet-content">${spellsContent}</div></div>`;
  },

  _renderRacialTraits(parsed) {
    const traitsMarkup = parsed.racialTraits
      .map((trait) => `<div class="text-dim">• ${this.escapeHtml(trait)}</div>`)
      .join('');

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[RACIAL TRAITS]</div></div><div class="sheet-content">${traitsMarkup}</div></div>`;
  },

  _renderEquipment(parsed) {
    const equipmentMarkup = parsed.equipment
      .map(
        (item) =>
          `<div class="text-dim">• ${this.escapeHtml(item,)}</div>`,
      )
      .join('');

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[${parsed.hasClassEquipment?'EQUIPMENT':'CLASS EQUIPMENT'}]</div></div><div class="sheet-content">${equipmentMarkup}</div></div>`;
  },

  _renderToolProficiencies(parsed) {
    const toolsMarkup = parsed.toolProficiencies
      .map((tool) => {
        const label = this.escapeHtml(this.formatSkillName(tool));
        return `<div class="text-dim">• ${label}</div>`;
      })
      .join('');

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[TOOL PROFICIENCIES]</div></div><div class="sheet-content">${toolsMarkup}</div></div>`;
  },

  _renderLanguages(parsed) {
    const hasLanguages = parsed.languages.length > 0;
    const hasChoices = parsed.languageChoices > 0;
    
    if (!hasLanguages && !hasChoices) {
      return '';
    }
    
    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[LANGUAGES]</div></div><div class="sheet-content">${hasLanguages?parsed.languages.map((lang)=>`<div class="text-dim">• ${this.escapeHtml(
                        lang,
                      )}</div>`,).join(''):''}
${hasChoices?`<div class="text-dim ${hasLanguages ? 'mt-sm' : ''}">+ Choose ${parsed.languageChoices} additional language${parsed.languageChoices > 1 ? 's' : ''}</div>`:''}</div></div>`;
  },

  _renderBackgroundFeature(parsed) {
    const name = this.escapeHtml(parsed.backgroundFeatureName || 'Feature');
    const description = this.escapeHtml(
      parsed.backgroundFeatureDescription || '',
    );

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[BACKGROUND FEATURE]</div></div><div class="sheet-content"><div class="stat-line"><span class="stat-label">${name}</span></div><div class="text-dim mt-sm">${description}</div></div></div>`;
  },

  _renderBackstory(parsed) {
    const backstory = this.escapeHtml(parsed.backstory || '');

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[BACKSTORY]</div></div><div class="sheet-content text-dim">${backstory}</div></div>`;
  },

  _renderExportInfo(character) {
    const exportedBy = character.exportedBy
      ? this.escapeHtml(character.exportedBy)
      : null;
    const version = this.escapeHtml(character.exportVersion || '1.0');

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[EXPORT INFO]</div></div><div class="sheet-content"><div class="stat-line"><span class="stat-label">Exported:</span><span class="stat-value">${new Date(character.exportDate,).toLocaleDateString()}</span></div>${exportedBy?`
            <div class="stat-line">
              <span class="stat-label">Source:</span>
              <span class="stat-value">${exportedBy}</span>
            </div>
          `:''}<div class="stat-line"><span class="stat-label">Version:</span><span class="stat-value">${version}</span></div></div></div>`;
  },

  // ========================================
  // DATA PARSING & HELPERS
  // ========================================

  _parseCharacterData(character, context = 'manager') {
    // In builder context, show all sections from the start (except spells)
    const isBuilder = context === 'builder';
    // Minimal built-in mapping of standard 5e class hit dice so the sheet
    // can render correct values even when DND_DATA is not loaded (e.g. manager).
    const HIT_DIE_BY_CLASS = {
      barbarian: 12,
      fighter: 10,
      paladin: 10,
      ranger: 10,
      cleric: 8,
      druid: 8,
      monk: 8,
      rogue: 8,
      bard: 8,
      warlock: 8,
      wizard: 6,
      sorcerer: 6,
    };
    
    // Handle HP (old and new formats)
    const hp = character.hitPoints || { current: 0, max: 0 };
    const hpMax = typeof hp === 'number' ? hp : hp.max || 0;
    const hpCurrent = typeof hp === 'number' ? hp : hp.current || hpMax;

    // Handle abilities (old 'abilityScores' and new 'abilities' format)
    const abilities = character.abilities || character.abilityScores || {};
    const abilityModifiers = character.abilityModifiers || {};
    
    // Check if abilities have been actually rolled/populated.
    // - In the builder, baseAbilities is set when abilities are rolled.
    // - For builder context (when baseAbilities exists in the character object structure),
    //   only show actual values when baseAbilities has been set (not null).
    // - In manager/cloud-sourced characters, baseAbilities may be undefined,
    //   so we check if any ability score differs from the default 10.
    const hasNonDefaultAbilities = abilities && 
      Object.values(abilities).some(score => score !== 10 && score !== 0);
    const abilitiesPopulated =
      (character.baseAbilities !== null && character.baseAbilities !== undefined) ||
      (character.baseAbilities === undefined && hasNonDefaultAbilities);

    // Handle race/class/background names (enhanced export has nested data)
    const raceName = character.raceData?.name || character.race || null;
    const className = character.classData?.name || character.class || null;
    const backgroundName =
      character.backgroundData?.name || character.background || null;

    // Derive hit die:
    // - Prefer any explicit character-level override (manager edits)
    // - Then fall back to nested classData if present
    // - Then try to infer from a built-in class → hitDie map
    // - Then, if DND_DATA is available (builder context), use its classes list
    // - Finally, use a conservative default of d6 if nothing else is available
    let hitDie = character.hitDie || character.classData?.hitDie || null;
    if (!hitDie) {
      const rawClass = character.class || className || '';
      const normalized = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
      if (normalized && HIT_DIE_BY_CLASS[normalized]) {
        hitDie = HIT_DIE_BY_CLASS[normalized];
      }
    }
    if (!hitDie && window.DND_DATA && Array.isArray(window.DND_DATA.classes)) {
      const classIdOrName = character.class || className;
      if (classIdOrName) {
        const cls = window.DND_DATA.classes.find(
          (c) => c.id === classIdOrName || c.name === classIdOrName,
        );
        if (cls && cls.hitDie) {
          hitDie = cls.hitDie;
        }
      }
    }
    if (!hitDie) {
      hitDie = 6;
    }

    // Handle equipment
    const classEquipment = character.classData?.equipment || [];
    const explicitEquipment = character.equipment || [];
    // If player has explicitly edited equipment, treat that as the source of truth.
    // Otherwise, fall back to class equipment + any existing equipment array.
    const allEquipment =
      explicitEquipment && explicitEquipment.length > 0
        ? explicitEquipment
        : [...new Set([...(character.equipment || []), ...classEquipment])];

    // Handle racial traits
    const race = window.DND_DATA?.races?.find((r) => r.id === character.race);
    const racialTraits =
      character.raceData?.traits || race?.traits || [];

    // Handle languages
    // If character.languages has been explicitly edited, use it as-is.
    // Otherwise, merge race languages for convenience.
    let languages = [...(character.languages || [])];
    if (languages.length === 0) {
      languages = [
        ...languages,
        ...(character.raceData?.languages || []),
      ];
    }

    // Handle background feature
    const backgroundFeature =
      character.backgroundFeature || character.backgroundData?.feature || null;

    // Skill modifiers and proficiencies
    const skillModifiers = character.skillModifiers || character.skills || {};
    const skillProficiencies = character.skillProficiencies || [];

    return {
      // Basic info
      raceName,
      className,
      backgroundName,
      alignment: character.alignment || null,
      sex: character.sex || null,
      level: character.level || 1,

      // Combat stats
      hpMax,
      hpCurrent,
      armorClass: character.armorClass || 10,
      initiative: character.initiative || 0,
      speed: character.speed || 30,
      proficiencyBonus: character.proficiencyBonus || 2,
      hitDie,

      // Abilities
      abilities,
      abilityModifiers,
      abilitiesSet: abilitiesPopulated,

      // Saving throws
      savingThrows: character.savingThrows || [],
      savingThrowModifiers: character.savingThrowModifiers || null,

      // Skills
      skillModifiers,
      skillProficiencies,

      // Features & traits
      racialTraits,
      toolProficiencies: character.toolProficiencies || [],
      languages,
      languageChoices: character.languageChoices || 0,

      // Equipment
      equipment: allEquipment,

      // Background
      backgroundFeatureName:
        backgroundFeature?.name || 'Feature',
      backgroundFeatureDescription:
        backgroundFeature?.description || '',
      backstory: character.backstory || null,

      // Spells
      spellcastingAbility: character.spellcastingAbility || null,
      cantrips: character.cantrips || [],
      spellsKnown: character.spellsKnown || [],
      spellsPrepared: character.spellsPrepared || [],
      spellSlots: character.spellSlots || {},

      // Flags for conditional rendering
      // In builder, always show sections (except spells until we know they're a caster)
      hasRace: !!raceName,
      hasClass: !!className,
      hasAbilities: isBuilder || Object.keys(abilities).length > 0,
      hasCombatStats: isBuilder || hpMax > 0 || character.armorClass,
      hasSavingThrows: isBuilder || (
        character.savingThrowModifiers &&
        Object.keys(character.savingThrowModifiers).length > 0
      ),
      hasSkills: isBuilder || (
        Object.keys(skillModifiers).length > 0 ||
        skillProficiencies.length > 0
      ),
      hasSpells:
        (character.cantrips && character.cantrips.length > 0) ||
        (character.spellsKnown && character.spellsKnown.length > 0) ||
        (character.spellsPrepared && character.spellsPrepared.length > 0),
      hasRacialTraits: isBuilder || racialTraits.length > 0,
      hasEquipment: isBuilder || allEquipment.length > 0,
      hasClassEquipment:
        (!explicitEquipment || explicitEquipment.length === 0) &&
        classEquipment.length > 0,
      hasToolProficiencies: isBuilder || (
        character.toolProficiencies && character.toolProficiencies.length > 0
      ),
      hasLanguages: isBuilder || languages.length > 0 || character.languageChoices > 0,
      hasBackgroundFeature: isBuilder || !!backgroundFeature,
      hasBackstory: isBuilder || !!character.backstory,
      hasExportInfo: !!character.exportDate,
    };
  },

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * HTML-escape helper. Delegates to the shared Utils implementation.
   * Kept as a method on CharacterSheet for backwards compatibility.
   */
  escapeHtml(value) {
    return window.Utils && typeof Utils.escapeHtml === 'function'
      ? Utils.escapeHtml(value)
      : (value === null || value === undefined ? '' : String(value));
  },

  /**
   * Determine the best ASCII portrait to use for a character.
   * Prefers:
   * 1) Custom AI portraits
   * 2) Stored asciiPortrait that matches the current race|class key
   * 3) Exported portrait.ascii
   * 4) Legacy asciiPortrait field
   */
  getAsciiPortrait(character) {
    if (!character) return null;

    const charId = character.id;
    const charName = character.name;
    let source = null;
    let result = null;

    // Prefer the active portrait version from history when available so
    // manager, builder, and history views all agree on "current" art.
    try {
      const metadata = character.portraitMetadata;
      if (
        metadata &&
        Array.isArray(metadata.versions) &&
        metadata.activeVersionId
      ) {
        const activeVersion = metadata.versions.find(
          (v) => v && v.id === metadata.activeVersionId,
        );
        if (activeVersion && activeVersion.ascii) {
          source = 'portraitMetadata.activeVersion';
          result = activeVersion.ascii;
          logPortraitDebug('getAsciiPortrait', charId, charName, {
            source,
            activeVersionId: metadata.activeVersionId,
            asciiLength: result.length,
            asciiPreview: result.substring(0, 50) + '...'
          });
          return result;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

    const key = `${character.race||''}|${character.class||''}`;

    // 1) Explicit custom portrait always wins
    if (character.customPortraitAscii) {
      source = 'customPortraitAscii';
      result = character.customPortraitAscii;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 2) If asciiPortrait is tagged for this race/class combo, trust it
    if (
      character.asciiPortrait &&
      character.asciiPortraitKey &&
      character.asciiPortraitKey === key
    ) {
      source = 'asciiPortrait (key-matched)';
      result = character.asciiPortrait;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiPortraitKey: character.asciiPortraitKey,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 3) Exported portrait object from builder
    if (character.portrait && character.portrait.ascii) {
      source = 'portrait.ascii';
      result = character.portrait.ascii;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 4) Legacy asciiPortrait without key tagging
    if (character.asciiPortrait) {
      source = 'asciiPortrait (legacy)';
      result = character.asciiPortrait;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    logPortraitDebug('getAsciiPortrait', charId, charName, {
      source: 'none',
      raceClassKey: key,
      result: null
    });
    return null;
  },

  /**
   * Determine the best original portrait URL to use for a character.
   * Mirrors getAsciiPortrait() to ensure ASCII and URL come from the same source.
   * Prefers:
   * 1) Active portrait version's URL from history
   * 2) originalPortraitUrl (custom AI portrait URL)
   * 3) portrait.url (exported portrait object)
   */
  getOriginalPortraitUrl(character) {
    if (!character) return null;

    const charId = character.id;
    const charName = character.name;
    let source = null;
    let result = null;

    // Prefer the active portrait version from history when available so
    // manager, builder, and history views all agree on "current" art.
    try {
      const metadata = character.portraitMetadata;
      if (
        metadata &&
        Array.isArray(metadata.versions) &&
        metadata.activeVersionId
      ) {
        const activeVersion = metadata.versions.find(
          (v) => v && v.id === metadata.activeVersionId,
        );
        if (activeVersion && activeVersion.url) {
          source = 'portraitMetadata.activeVersion';
          result = activeVersion.url;
          logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
            source,
            activeVersionId: metadata.activeVersionId,
            url: result
          });
          return result;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

    // 1) Explicit custom portrait URL
    if (character.originalPortraitUrl) {
      source = 'originalPortraitUrl';
      result = character.originalPortraitUrl;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    // 2) Exported portrait object from builder
    if (character.portrait && character.portrait.url) {
      source = 'portrait.url';
      result = character.portrait.url;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    // 3) Fall back to default portrait based on race/class
    if (window.DefaultPortraits && character.race && character.class) {
      const defaultUrl = DefaultPortraits.getUrl(character.race, character.class);
      if (defaultUrl && DefaultPortraits.exists(character.race, character.class)) {
        source = 'DefaultPortraits (race/class fallback)';
        result = defaultUrl;
        logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
          source,
          race: character.race,
          class: character.class,
          url: result
        });
        return result;
      }
    }

    logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
      source: 'none',
      result: null
    });
    return null;
  },

  formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  },

  formatSkillName(skill) {
    return skill
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Convert a string to sentence case: first letter uppercase, rest lowercase.
   * Used for basic info fields like race, class, background, and alignment so
   * that older characters with lowercase values still render consistently.
   */
  toSentenceCase(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /**
   * Convert alignment abbreviation to full name
   * @param {string} alignmentId - Abbreviation like 'lg', 'ce', etc.
   * @returns {string} Full alignment name like 'Lawful Good', 'Chaotic Evil', etc.
   */
  formatAlignment(alignmentId) {
    const alignmentMap = {
      'lg': 'Lawful Good',
      'ng': 'Neutral Good',
      'cg': 'Chaotic Good',
      'ln': 'Lawful Neutral',
      'n': 'True Neutral',
      'cn': 'Chaotic Neutral',
      'le': 'Lawful Evil',
      'ne': 'Neutral Evil',
      'ce': 'Chaotic Evil'
    };
    
    if (!alignmentId) return '';
    
    // If it's already a full name (not an abbreviation), return as-is
    if (alignmentId.length > 3) return alignmentId;
    
    // Convert to lowercase for case-insensitive lookup
    const key = alignmentId.toLowerCase();
    return alignmentMap[key] || alignmentId;
  },

  /**
   * Helper function to populate ASCII portrait after rendering
   * Call this after inserting the HTML into the DOM
   * @param {Object} character - Character data object
   * @param {string} context - 'builder' or 'manager' to determine which ID to use
   */
  populatePortrait(character, context = 'manager') {
    const portraitId =
      context === 'builder'
        ? 'character-portrait'
        : `character-portrait-${character.id||'current'}`;
    const portraitEl = document.getElementById(portraitId);
    const asciiPortrait = this.getAsciiPortrait(character);

    // Store character ID on the portrait element for async validation
    // This prevents race conditions where async operations complete after
    // the user has selected a different character
    if (portraitEl && character.id) {
      portraitEl.setAttribute('data-character-id', character.id);
    }

    if (portraitEl && asciiPortrait) {
      this.setPortraitContent(portraitEl, asciiPortrait);
    }

    // Attempt a transparent upgrade to the best available pre-generated
    // portrait (race+class combo) when possible. This fixes older characters
    // that only have race-level art stored.
    this._maybeUpgradePortraitFromFiles(character, context, portraitEl);
  },

  /**
   * Set ASCII art content on a portrait element, wrapping in a <pre> for
   * proper centering via CSS flexbox. The parent .ascii-portrait uses
   * display:flex + justify-content:center, and the inner <pre> holds the
   * preformatted text.
   * @param {HTMLElement} portraitEl
   * @param {string} asciiArt
   */
  setPortraitContent(portraitEl, asciiArt) {
    if (!portraitEl) return;
    // Remove placeholder/loading classes since we now have real content
    portraitEl.classList.remove('ascii-portrait--placeholder', 'ascii-portrait--loading');
    // Clear existing content and insert wrapped <pre>
    portraitEl.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = asciiArt;
    portraitEl.appendChild(pre);
  },

  /**
   * Safely center the horizontal scroll position of a portrait element.
   * Extracted so we can reuse it after async portrait upgrades.
   * @param {HTMLElement} portraitEl
   * @private
   * @deprecated CSS flexbox now handles centering; this is kept for backwards compat
   */
  _centerPortraitScrollSafely(portraitEl) {
    // CSS flexbox now handles centering - this is a no-op for backwards compat
  },

  /**
   * If the character doesn't already have a race+class-tagged ASCII portrait,
   * try to upgrade it using the pre-generated files under generated_portraits/.
   *
   * This runs transparently in the background and, if successful, will:
   * - update the in-memory character object
   * - persist the new portrait (CharacterStorage / CharacterState)
   * - refresh the visible portrait element
   *
   * @param {Object} character
   * @param {string} context
   * @param {HTMLElement|null} portraitEl
   * @private
   */
  _maybeUpgradePortraitFromFiles(character, context, portraitEl) {
    try {
      if (!character) return;

      // Never override an explicit custom AI portrait
      if (character.customPortraitAscii) {
        logPortraitDebug('_maybeUpgradePortraitFromFiles SKIPPED (has customPortraitAscii)', 
          character.id, character.name, { context });
        return;
      }

      // Never override if portrait history exists
      if (character.portraitMetadata?.versions?.length > 0) {
        logPortraitDebug('_maybeUpgradePortraitFromFiles SKIPPED (has portrait history)', 
          character.id, character.name, { 
            context, 
            versionsCount: character.portraitMetadata.versions.length,
            activeVersionId: character.portraitMetadata.activeVersionId
          });
        return;
      }

      const race = character.race;
      const classType = character.class;
      if (!race || !classType) return;

      const key = `${race||''}|${classType||''}`;

      // If we already have a portrait that is explicitly tagged for this
      // exact race/class combo, there's nothing to upgrade.
      if (character.asciiPortrait && character.asciiPortraitKey === key) {
        return;
      }

      // Log that we're attempting to upgrade (this could be the culprit!)
      logPortraitDebug('_maybeUpgradePortraitFromFiles ATTEMPTING upgrade', 
        character.id, character.name, { 
          context, 
          key,
          hasCustomPortraitAscii: !!character.customPortraitAscii,
          hasPortraitMetadata: !!character.portraitMetadata,
          versionsCount: character.portraitMetadata?.versions?.length || 0
        });

      // Lightweight in-memory cache so we only fetch each combo once per page load
      if (!this._portraitFileCache) {
        this._portraitFileCache = {};
      }
      const cacheKey = `${String(race).toLowerCase()}|${String(classType,).toLowerCase()}`;

      if (this._portraitFileCache[cacheKey]) {
        this._applyUpgradedPortrait(
          character,
          context,
          portraitEl,
          this._portraitFileCache[cacheKey],
          key,
        );
        return;
      }

      // Async fetch so we don't block rendering
      (async () => {
        try {
          const raceSlug = String(race)
            .toLowerCase()
            .replace(/\s+/g, '-');
          const classSlug = String(classType)
            .toLowerCase()
            .replace(/\s+/g, '-');
          const basePath = 'generated_portraits/ascii';

          let best = null;

          // Try race-class combo first
          if (raceSlug && classSlug) {
            try {
              const resp = await fetch(
                `${basePath}/${raceSlug}-${classSlug}.txt`,
              );
              if (resp.ok) {
                best = await resp.text();
              }
            } catch (e) {
              // Network or fetch issue – we'll try race-only next
              console.warn(
                'CharacterSheet._maybeUpgradePortraitFromFiles: race-class fetch failed',
                e,
              );
            }
          }

          // Fallback to race-only portrait
          if (!best && raceSlug) {
            try {
              const resp = await fetch(`${basePath}/${raceSlug}.txt`);
              if (resp.ok) {
                best = await resp.text();
              }
            } catch (e) {
              console.warn(
                'CharacterSheet._maybeUpgradePortraitFromFiles: race-only fetch failed',
                e,
              );
            }
          }

          if (!best) {
            return;
          }

          this._portraitFileCache[cacheKey] = best;
          await this._applyUpgradedPortrait(character, context, portraitEl, best, key);
        } catch (e) {
          console.warn(
            'CharacterSheet._maybeUpgradePortraitFromFiles: unexpected error',
            e,
          );
        }
      })();
    } catch (e) {
      console.warn(
        'CharacterSheet._maybeUpgradePortraitFromFiles: setup error',
        e,
      );
    }
  },

  /**
   * Apply an upgraded ASCII portrait to the character, persist it, and
   * refresh the DOM element if provided.
   *
   * @param {Object} character
   * @param {string} context
   * @param {HTMLElement|null} portraitEl
   * @param {string} ascii
   * @param {string} key
   * @private
   */
  async _applyUpgradedPortrait(character, context, portraitEl, ascii, key) {
    if (!character || !ascii) return;

    // If a custom AI portrait has been created (or version history exists),
    // never let a late-arriving "upgrade from files" overwrite it. This guards
    // against races where `_maybeUpgradePortraitFromFiles` was kicked off
    // before the player generated a custom portrait, but finishes afterward.
    const hasCustomPortrait =
      !!character.customPortraitAscii ||
      (character.portraitMetadata &&
        Array.isArray(character.portraitMetadata.versions) &&
        character.portraitMetadata.versions.length > 0);
    if (hasCustomPortrait) {
      logPortraitDebug('_applyUpgradedPortrait BLOCKED (has custom portrait)', 
        character.id, character.name, { 
          context, 
          key,
          hasCustomPortraitAscii: !!character.customPortraitAscii,
          versionsCount: character.portraitMetadata?.versions?.length || 0
        });
      return;
    }

    // Validate that the portrait element still belongs to this character.
    // This prevents race conditions where the user selected a different card
    // while the async portrait file fetch was in progress.
    if (portraitEl && character.id) {
      const elementCharacterId = portraitEl.getAttribute('data-character-id');
      if (elementCharacterId && elementCharacterId !== character.id) {
        // The DOM element now belongs to a different character; abort update
        logPortraitDebug('_applyUpgradedPortrait BLOCKED (element belongs to different character)', 
          character.id, character.name, { 
            context, 
            elementCharacterId,
            characterId: character.id
          });
        return;
      }
    }

    // Log that we're about to apply an upgraded portrait - this could overwrite a custom one!
    logPortraitDebug('_applyUpgradedPortrait APPLYING generic portrait', 
      character.id, character.name, { 
        context, 
        key,
        asciiLength: ascii?.length || 0
      });

    // In manager context, also check if the selected character has changed
    // This provides an additional safety check beyond the DOM attribute
    if (context === 'manager' && window.AppState && character.id) {
      if (AppState.selectedCharacterId && AppState.selectedCharacterId !== character.id) {
        // User has selected a different character; abort update
        return;
      }
    }

    character.asciiPortrait = ascii;
    character.asciiPortraitKey = key;

    // Persist the upgraded portrait so future loads are instant.
    // Use silent mode so automatic portrait upgrades don't mark character
    // as "modified" in manager views.
    try {
      if (context === 'manager' && window.CharacterStorage && character.id) {
        window.CharacterStorage.update(
          character.id,
          {
            asciiPortrait: ascii,
            asciiPortraitKey: key,
          },
          { silent: true },
        );
      } else if (context === 'builder' && window.CharacterState) {
        // In builder context, update local state only. We no longer auto-save
        // new characters here; the player explicitly saves from the builder UI.
        window.CharacterState.updateCharacter({
          asciiPortrait: ascii,
          asciiPortraitKey: key,
        });
      }
    } catch (e) {
      console.warn(
        'CharacterSheet._applyUpgradedPortrait: failed to persist upgraded portrait',
        e,
      );
    }

    // Refresh the visible portrait
    if (portraitEl) {
      this.setPortraitContent(portraitEl, ascii);
    }
  },
});

// ========================================
// SHARED PORTRAIT VERSIONING HELPERS
// ========================================

const PortraitHistory = (window.PortraitHistory = {
  MAX_VERSIONS: 5,

  /**
   * Append a new portrait version to a character's metadata.
   * Returns the updated portraitMetadata object (does not mutate character).
   *
   * @param {Object} character
   * @param {string} asciiArt
   * @param {string|null} imageUrl
   * @param {Object} extra - { source, prompt, style, model, quality, characterDescription }
   */
  addVersion(character, asciiArt, imageUrl, extra = {}) {
    if (!character) {
      return character?.portraitMetadata || {};
    }

    const existingMetadata = character.portraitMetadata || {};
    const existingVersions = Array.isArray(existingMetadata.versions)
      ? existingMetadata.versions
      : [];

    const id = `v_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;

    const version = {
      id,
      createdAt: new Date().toISOString(),
      ascii: asciiArt || '',
      url: imageUrl || null,
      source: extra.source || 'custom-ai',
      prompt: extra.prompt || null,
      characterDescription: extra.characterDescription || null,
      style: extra.style || null,
      model: extra.model || null,
      quality: extra.quality || null,
    };

    const versions = [version, ...existingVersions].slice(0, this.MAX_VERSIONS);

    return {
      ...existingMetadata,
      versions,
      activeVersionId: id,
    };
  },

  /**
   * Normalize a character's portrait metadata for display in history modals.
   * Ensures:
   * - versions is always an array
   * - the active version (if any) appears first
   * - hasCustomPortraitWithoutHistory matches both builder + manager semantics
   *
   * @param {Object} character
   * @returns {{ metadata: Object, versions: Array, hasVersions: boolean, hasCustomPortraitWithoutHistory: boolean }}
   */
  normalizeForDisplay(character) {
    const safeCharacter = character || {};
    const metadata = safeCharacter.portraitMetadata || {};
    const rawVersions = Array.isArray(metadata.versions)
      ? metadata.versions
      : [];

    const hasVersions = rawVersions.length > 0;

    // Ensure the current active portrait appears first so the existing art is
    // both visually first and keyboard-focused when the modal opens.
    let versions = rawVersions;
    if (hasVersions && metadata.activeVersionId) {
      const active = rawVersions.find((v) => v.id === metadata.activeVersionId);
      if (active) {
        const others = rawVersions.filter((v) => v.id !== active.id);
        versions = [active, ...others];
      }
    }

    // Match both Character Builder and Manager semantics: if the character
    // already has a custom portrait but no history yet, show a helpful empty
    // state instead of the generic "no saved portraits" message.
    const hasCustomPortraitWithoutHistory =
      !hasVersions &&
      (safeCharacter.customPortraitAscii ||
        safeCharacter.originalPortraitUrl ||
        (safeCharacter.portrait && safeCharacter.portrait.url));

    return {
      metadata,
      versions,
      hasVersions,
      hasCustomPortraitWithoutHistory,
    };
  },

  /**
   * Populate ASCII thumbnails + prompt text for portrait history cards in
   * small batches on animation frames so we don't block the main thread when
   * versions contain large ASCII payloads.
   *
   * This helper is shared by both Character Builder and Character Manager.
   *
   * @param {Array} versions
   * @param {Function} cropFn - function(ascii: string) => string
   */
  batchPopulateAsciiPreviews(versions, cropFn) {
    if (!Array.isArray(versions) || versions.length === 0) return;

    const batchSize = 2;
    let index = 0;

    const processBatch = () => {
      const end = Math.min(versions.length, index + batchSize);
      for (let i = index; i < end; i++) {
        const v = versions[i];
        if (!v) continue;

        const el = document.querySelector(
          `.portrait-history-preview.ascii-portrait[data-version-id="${v.id}"]`,
        );
        if (el && v.ascii) {
          try {
            const cropped =
              typeof cropFn === 'function' ? cropFn(v.ascii) : v.ascii;
            // Use <pre> wrapper for proper CSS flex centering
            el.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = cropped;
            el.appendChild(pre);
          } catch (e) {
            // Non-fatal: fall back to raw ASCII if cropping fails.
            el.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = v.ascii;
            el.appendChild(pre);
          }
        }

        const promptEl = document.querySelector(
          `.portrait-history-prompt[data-version-id="${v.id}"]`,
        );
        if (promptEl && v.prompt) {
          promptEl.textContent = v.prompt;
        }
      }

      index = end;
      if (
        index < versions.length &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        window.requestAnimationFrame(processBatch);
      }
    };

    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(processBatch);
    } else {
      // Fallback: process synchronously if rAF is not available
      processBatch();
    }
  },
});




// ===== BUNDLE PART: character-manager-api.js =====

// ========================================
// CHARACTER MANAGER - CLOUD API SERVICE
// ========================================
// Handles authentication and cloud storage operations for character-manager

// Shared environment / URL config (single source of truth for the whole app)
const {
  isLocalEnvironment = false,
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} = window.DanddyConfig || {};

const DEBUG_CLOUD = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

// ========================================
// AUTH SERVICE
// ========================================
// The unified AuthService is now defined in `danddy-auth.js` and exposed as
// `window.AuthService`. This file only *uses* that shared service (for example,
// via AuthService.getToken() inside API helpers below).

// ========================================
// CHARACTER CLOUD STORAGE SERVICE
// ========================================
const CharacterCloudStorage = (window.CharacterCloudStorage = {
  // Helper to convert spell arrays (objects or strings) to string arrays for backend
  _spellsToStringArray(arr) {
    if (!arr || !Array.isArray(arr)) return [];
    
    return arr.map(item => {
      // If it's an object with a name property, extract the name
      if (typeof item === 'object' && item !== null && item.name) {
        return item.name;
      }
      // If it's already a string, return as-is
      if (typeof item === 'string') {
        return item;
      }
      // Fallback - convert to string
      return String(item);
    });
  },
  
  // Convert localStorage character format to API format (shared mapper)
  _toAPIFormat(character) {
    return window.DanddyCharacterMapper.fromManagerToBackend(character);
  },
  
  // Convert API format to frontend character format (shared mapper)
  _fromAPIFormat(apiChar) {
    return window.DanddyCharacterMapper.fromBackendToManager(apiChar);
  },

  // Map alignment to API enum format
  _mapAlignment(alignment) {
    if (!alignment) return null;
    
    const alignmentMap = {
      'Lawful Good': 'lawful_good',
      'Neutral Good': 'neutral_good',
      'Chaotic Good': 'chaotic_good',
      'Lawful Neutral': 'lawful_neutral',
      'True Neutral': 'true_neutral',
      'Chaotic Neutral': 'chaotic_neutral',
      'Lawful Evil': 'lawful_evil',
      'Neutral Evil': 'neutral_evil',
      'Chaotic Evil': 'chaotic_evil',
    };
    
    return alignmentMap[alignment] || null;
  },

  // Make authenticated API request
  async _apiRequest(endpoint, options = {}) {
    const token = AuthService.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token expired or invalid – clear auth state and sync UI so the user
      // doesn't appear "logged in" while we silently fall back to local data.
      AuthService.clearToken();
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const detail =
        typeof error.detail === 'string'
          ? error.detail
          : JSON.stringify(error.detail || error);
      console.error('API error response:', error);
      throw new Error(detail || `API error:${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  },

  // Get all characters for current user
  async getAll() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching all characters from API...');
      }
      const apiChars = await this._apiRequest('/characters/');
      const characters = apiChars.map(c => this._fromAPIFormat(c));
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Retrieved', characters.length, 'characters');
      }
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch characters:', error);
      throw error;
    }
  },

  // Get single character by ID
  async getById(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}`);
      return this._fromAPIFormat(apiChar);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch character:', error);
      throw error;
    }
  },

  // Add new character
  async add(character) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Creating character:', character.name);
      }
      const apiData = this._toAPIFormat(character);
      const apiChar = await this._apiRequest('/characters/', {
        method: 'POST',
        body: JSON.stringify(apiData),
      });
      
      const newChar = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character created with ID:', newChar.id);
      }
      return newChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to create character:', error);
      throw error;
    }
  },

  // Update existing character
  async update(id, updates) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Updating character', id);
      }
      
      // For partial updates, we need to map the frontend fields
      const apiUpdates = {};
      
      // Map common update fields
      if (updates.name !== undefined) apiUpdates.name = updates.name;
      if (updates.level !== undefined) apiUpdates.level = updates.level;
      if (updates.experiencePoints !== undefined) apiUpdates.experience_points = updates.experiencePoints;
      if (updates.alignment !== undefined) {
        // Convert frontend alignment ID (lg, ce, etc.) to backend enum format
        const alignmentMap = {
          'lg': 'lawful_good',
          'ng': 'neutral_good',
          'cg': 'chaotic_good',
          'ln': 'lawful_neutral',
          'n': 'true_neutral',
          'cn': 'chaotic_neutral',
          'le': 'lawful_evil',
          'ne': 'neutral_evil',
          'ce': 'chaotic_evil'
        };
        apiUpdates.alignment = alignmentMap[updates.alignment] || updates.alignment;
      }
      
      // Ability Scores (partial updates from manager)
      if (updates.abilities) {
        const abilities = updates.abilities;
        if (abilities.str !== undefined) apiUpdates.strength = abilities.str;
        if (abilities.dex !== undefined) apiUpdates.dexterity = abilities.dex;
        if (abilities.con !== undefined) apiUpdates.constitution = abilities.con;
        if (abilities.int !== undefined) apiUpdates.intelligence = abilities.int;
        if (abilities.wis !== undefined) apiUpdates.wisdom = abilities.wis;
        if (abilities.cha !== undefined) apiUpdates.charisma = abilities.cha;
      }

      // Combat stats
      if (updates.hitPoints?.max !== undefined) apiUpdates.hit_points_max = updates.hitPoints.max;
      if (updates.hitPoints?.current !== undefined) apiUpdates.hit_points_current = updates.hitPoints.current;
      if (updates.hitPoints?.temp !== undefined) apiUpdates.hit_points_temp = updates.hitPoints.temp;
      if (updates.armorClass !== undefined) apiUpdates.armor_class = updates.armorClass;
      if (updates.initiative !== undefined) apiUpdates.initiative = updates.initiative;
      if (updates.speed !== undefined) apiUpdates.speed = updates.speed;
      
      // Arrays
      if (updates.skillProficiencies !== undefined) apiUpdates.skill_proficiencies = updates.skillProficiencies;
      if (updates.toolProficiencies !== undefined) apiUpdates.tool_proficiencies = updates.toolProficiencies;
      if (updates.languages !== undefined) apiUpdates.languages = updates.languages;
      if (updates.equipment !== undefined) {
        apiUpdates.inventory = updates.equipment.map(item => 
          typeof item === 'string' ? { name: item } : item
        );
      }
      if (updates.conditions !== undefined) apiUpdates.conditions = updates.conditions;
      
      // Text fields
      if (updates.backstory !== undefined) apiUpdates.backstory = updates.backstory;
      if (updates.sex !== undefined) apiUpdates.sex = updates.sex;
      
      // Portrait data
      if (updates.asciiPortrait !== undefined) apiUpdates.ascii_portrait = updates.asciiPortrait;
      if (updates.originalPortraitUrl !== undefined) apiUpdates.original_portrait_url = updates.originalPortraitUrl;
      if (updates.customPortraitAscii !== undefined) apiUpdates.custom_portrait_ascii = updates.customPortraitAscii;
      if (updates.customPortraitCount !== undefined) apiUpdates.custom_portrait_count = updates.customPortraitCount;
      if (updates.portraitMetadata !== undefined) apiUpdates.portrait_metadata = updates.portraitMetadata;
      
      const apiChar = await this._apiRequest(`/characters/${id}`, {
        method: 'PUT',
        body: JSON.stringify(apiUpdates),
      });
      
      const updatedChar = this._fromAPIFormat(apiChar);
      return updatedChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to update character:', error);
      throw error;
    }
  },

  // Delete character
  async delete(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Deleting character', id);
      }
      await this._apiRequest(`/characters/${id}`, { method: 'DELETE' });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character deleted successfully');
      }
      return true;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to delete character:', error);
      throw error;
    }
  },

  // Duplicate character
  async duplicate(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Duplicating character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}/duplicate`, {
        method: 'POST',
      });
      const duplicated = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character duplicated with ID:', duplicated.id);
      }
      return duplicated;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to duplicate character:', error);
      throw error;
    }
  },

  // Export character as JSON
  async export(id) {
    try {
      const character = await this.getById(id);
      return JSON.stringify(character, null, 2);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to export character:', error);
      throw error;
    }
  },

  // Import character from JSON
  async import(jsonString) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Importing character from JSON');
      }
      const character = JSON.parse(jsonString);
      
      // Remove ID if it exists (create new character)
      delete character.id;
      delete character.ownerId;
      
      const result = await this.add(character);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character imported with ID:', result.id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to import character:', error);
      return null;
    }
  },

  // Generate unique ID (not used for cloud storage, API generates IDs)
  generateId() {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
  },

  // ========================================
  // CHARACTER SHARING
  // ========================================

  /**
   * Share a character with another user by email.
   * @param {number|string} characterId - The character ID to share
   * @param {string} email - The recipient's email address
   * @returns {Promise<Object>} The created share record
   */
  async shareCharacter(characterId, email) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Sharing character', characterId, 'to', email);
      }
      const result = await this._apiRequest(`/shares/character/${characterId}`, {
        method: 'POST',
        body: JSON.stringify({ to_email: email }),
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character shared successfully');
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to share character:', error);
      throw error;
    }
  },

  /**
   * Get pending character shares for the current user.
   * @returns {Promise<Array>} List of pending shares with character previews
   */
  async getPendingShares() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching pending shares...');
      }
      const shares = await this._apiRequest('/shares/pending');
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', shares.length, 'pending shares');
      }
      return shares;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:', error);
      throw error;
    }
  },

  /**
   * Accept a pending character share (creates a copy).
   * @param {number} shareId - The share ID to accept
   * @returns {Promise<Object>} Result with the new character ID
   */
  async acceptShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Accepting share', shareId);
      }
      const result = await this._apiRequest(`/shares/${shareId}/accept`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share accepted, new character ID:', result.character_id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to accept share:', error);
      throw error;
    }
  },

  /**
   * Dismiss a pending character share (ignores forever).
   * @param {number} shareId - The share ID to dismiss
   * @returns {Promise<void>}
   */
  async dismissShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Dismissing share', shareId);
      }
      await this._apiRequest(`/shares/${shareId}/dismiss`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share dismissed');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to dismiss share:', error);
      throw error;
    }
  },
});

// ========================================
// MIGRATION UTILITY
// ========================================
const MigrationService = (window.MigrationService = {
  LOCAL_STORAGE_KEY: (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) || 'dnd_characters',
  
  // Check if there are characters in localStorage (excluding demo characters)
  hasLocalCharacters() {
    const characters = this._getLocalCharacters();
    // Only count non-demo characters for migration prompt
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length > 0;
  },

  // Check if there are demo characters in localStorage
  hasDemoCharacters() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return false;
    return characters.some(c => window.DemoCharacters.isDemo(c));
  },

  // Get all local characters (helper)
  _getLocalCharacters() {
    return (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
  },

  // Get count of local characters (excluding demo)
  getLocalCharacterCount() {
    const characters = this._getLocalCharacters();
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length;
  },

  // Get count of demo characters
  getDemoCharacterCount() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return 0;
    return characters.filter(c => window.DemoCharacters.isDemo(c)).length;
  },

  // Migrate localStorage characters to cloud
  // Options:
  //   includeDemoCharacters: boolean - whether to include demo characters (default: false)
  async migrateToCloud(options = {}) {
    const { includeDemoCharacters = false } = options;
    
    try {
      if (!AuthService.isAuthenticated()) {
        throw new Error('Must be logged in to migrate characters');
      }

      console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');
      
      let localCharacters = this._getLocalCharacters();
      
      // Filter out demo characters if not including them
      if (!includeDemoCharacters && window.DemoCharacters) {
        localCharacters = localCharacters.filter(c => !window.DemoCharacters.isDemo(c));
      }
      
      console.log('📦 MIGRATION: Found', localCharacters.length, 'characters to migrate');
      
      const results = {
        total: localCharacters.length,
        success: 0,
        failed: 0,
        errors: [],
      };

      for (const character of localCharacters) {
        try {
          console.log('📦 MIGRATION: Migrating', character.name);
          // Remove demo flag when migrating to cloud
          const charToMigrate = { ...character };
          delete charToMigrate.isDemo;
          // Generate new ID for cloud (remove demo prefix)
          if (charToMigrate.id && String(charToMigrate.id).startsWith('demo_')) {
            delete charToMigrate.id;
          }
          await CharacterCloudStorage.add(charToMigrate);
          results.success++;
        } catch (error) {
          console.error('📦 MIGRATION ERROR: Failed to migrate', character.name, error);
          results.failed++;
          results.errors.push({ character: character.name, error: error.message });
        }
      }

      console.log('📦 MIGRATION: Complete!', results.success, 'succeeded,', results.failed, 'failed');
      
      return results;
    } catch (error) {
      console.error('📦 MIGRATION ERROR:', error);
      throw error;
    }
  },

  // Backup localStorage data before clearing
  backupLocalStorage() {
    const chars =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
    if (chars && chars.length) {
      const backup = {
        timestamp: new Date().toISOString(),
        characters: chars,
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dnd-characters-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log('📦 BACKUP: Created backup of', backup.characters.length, 'characters');
      return true;
    }
    return false;
  },

  // Clear localStorage characters (after successful migration)
  clearLocalStorage() {
    if (window.DanddyStorage) {
      window.DanddyStorage.clearAll();
    } else {
      // Remove primary character storage
      localStorage.removeItem(this.LOCAL_STORAGE_KEY);
      // Also remove any legacy/cache copies of characters to avoid duplicates
      try {
        localStorage.removeItem(this.LOCAL_STORAGE_KEY + '_cache');
      } catch (e) {
        console.warn('📦 CLEAR: Failed to clear local cache key', e);
      }
    }
    if (DEBUG_CLOUD) {
      console.log('📦 CLEAR: Cleared local character storage (including cache, if present)');
    }
  },
});

if (DEBUG_CLOUD) {
  console.log('☁️ Character Manager Cloud API Service loaded');
}




// ===== BUNDLE PART: demo-characters.js =====

// ========================================
// DEMO CHARACTERS
// ========================================
// Pre-made sample characters available in demo mode (not authenticated).
// These showcase the variety of characters users can create.
// 
// Demo characters can be fetched from the API (characters marked with is_demo=true)
// or fall back to hardcoded characters if the API is unavailable.

(function (global) {
  // Demo character IDs use a special prefix for identification
  const DEMO_PREFIX = 'demo_';
  
  // Key to track if user has been asked about demo migration
  const DEMO_MIGRATION_ASKED_KEY = 'danddy_demo_migration_asked';

  // Demo mode limits
  // Character limit is enforced locally (total characters stored)
  // Portrait limit is enforced by backend (daily quota)
  const DEMO_MAX_USER_CHARACTERS = 3;

  // Cache for loaded ASCII art and demo characters
  let _asciiCache = {};
  let _demoCharactersCache = null;
  let _asciiLoadPromise = null;
  let _apiDemoCharacters = null; // Characters fetched from API
  let _apiDemoFetchPromise = null;

  const DemoCharacters = (global.DemoCharacters = {
    DEMO_PREFIX,
    DEMO_MIGRATION_ASKED_KEY,
    DEMO_MAX_USER_CHARACTERS,

    /**
     * Load ASCII art for a race/class combination from pre-generated files.
     * @param {string} race - Character race
     * @param {string} classType - Character class
     * @returns {Promise<string|null>} ASCII art or null if not found
     */
    async _loadAscii(race, classType) {
      const raceLower = String(race).toLowerCase().replace(/\s+/g, '-');
      const classLower = String(classType).toLowerCase().replace(/\s+/g, '-');
      const key = `${raceLower}-${classLower}`;
      
      if (_asciiCache[key]) return _asciiCache[key];
      
      // Try to load from generated_portraits/ascii/
      const paths = [
        `generated_portraits/ascii/${key}.txt`,
        `./generated_portraits/ascii/${key}.txt`,
        `../generated_portraits/ascii/${key}.txt`,
      ];
      
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const ascii = await response.text();
            _asciiCache[key] = ascii;
            return ascii;
          }
        } catch (e) {
          // Try next path
        }
      }
      
      return null;
    },

    /**
     * Pre-load ASCII art for all demo characters.
     * Call this on page load to ensure demo characters have ASCII art ready.
     * Characters from API may already have ASCII art, so we skip those.
     * @returns {Promise<void>}
     */
    async loadAsciiForAllDemoCharacters() {
      if (_asciiLoadPromise) return _asciiLoadPromise;
      
      _asciiLoadPromise = (async () => {
        const characters = this.getAll();
        console.log('DemoCharacters: Loading ASCII art for', characters.length, 'demo characters...');
        
        let loadedCount = 0;
        let skippedCount = 0;
        const loadPromises = characters.map(async (char) => {
          // Skip if character already has ASCII art (from API)
          if (char.asciiPortrait) {
            skippedCount++;
            console.log(`⏭️ Skipped ${char.name}(already has ASCII art)`);
            return;
          }
          
          if (!char.race || !char.class) return;
          const ascii = await this._loadAscii(char.race, char.class);
          if (ascii) {
            // Patch the character object with ASCII art
            char.asciiPortrait = ascii;
            char.asciiPortraitKey = `${char.race}|${char.class}`;
            loadedCount++;
            console.log(`✅ Loaded ASCII for ${char.name}(${char.race}-${char.class})`);
          } else {
            console.warn(`❌ Failed to load ASCII for ${char.name}(${char.race}-${char.class})`);
          }
        });
        await Promise.all(loadPromises);
        console.log(`DemoCharacters:ASCII art loaded for ${loadedCount}/ skipped ${skippedCount} /total ${characters.length}demo characters`);
      })();
      
      return _asciiLoadPromise;
    },
    
    /**
     * Clear the demo characters cache. Useful for testing.
     */
    _clearCache() {
      _demoCharactersCache = null;
      _asciiCache = {};
      _asciiLoadPromise = null;
      _apiDemoCharacters = null;
      _apiDemoFetchPromise = null;
    },

    /**
     * Fetch demo characters from the API.
     * @returns {Promise<Array|null>} Array of demo characters or null if fetch failed
     */
    async fetchFromApi() {
      if (_apiDemoFetchPromise) return _apiDemoFetchPromise;

      _apiDemoFetchPromise = (async () => {
        try {
          const apiBase = global.DanddyConfig?.BACKEND_ORIGIN || 'https://danddy-api.onrender.com';
          console.log('DemoCharacters: Fetching demo characters from API...');
          
          const response = await fetch(`${apiBase}/api/characters/demo/list`);
          if (!response.ok) {
            console.warn('DemoCharacters: API returned', response.status);
            return null;
          }

          const apiChars = await response.json();
          console.log(`DemoCharacters:Fetched ${apiChars.length}demo characters from API`);

          // Transform API response to match expected format
          _apiDemoCharacters = apiChars.map(char => this._transformApiCharacter(char));
          return _apiDemoCharacters;
        } catch (err) {
          console.warn('DemoCharacters: Failed to fetch from API:', err.message);
          return null;
        }
      })();

      return _apiDemoFetchPromise;
    },

    /**
     * Transform an API character response to the format expected by the frontend.
     * @param {Object} apiChar - Character from API
     * @returns {Object} Transformed character
     */
    _transformApiCharacter(apiChar) {
      const nowIso = new Date().toISOString();
      
      return {
        // Use demo prefix for ID to mark as demo character
        id: `${DEMO_PREFIX}${apiChar.id}`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}${apiChar.id}`,
        
        // Basic info
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        background: apiChar.background,
        alignment: apiChar.alignment,
        sex: apiChar.sex,
        level: apiChar.level || 1,
        
        // Abilities
        abilities: {
          str: apiChar.strength,
          dex: apiChar.dexterity,
          con: apiChar.constitution,
          int: apiChar.intelligence,
          wis: apiChar.wisdom,
          cha: apiChar.charisma,
        },
        
        // Computed stats
        hitPoints: apiChar.hit_points_max,
        armorClass: apiChar.armor_class,
        initiative: apiChar.initiative,
        speed: apiChar.speed,
        
        // Skills and proficiencies
        skillProficiencies: apiChar.skill_proficiencies || [],
        savingThrows: apiChar.saving_throw_proficiencies || [],
        languages: apiChar.languages || [],
        toolProficiencies: apiChar.tool_proficiencies || [],
        
        // Spellcasting
        spellcastingAbility: apiChar.spellcasting_ability,
        cantrips: apiChar.cantrips || [],
        spellsKnown: apiChar.spells_known || [],
        spellSlots: apiChar.spell_slots || {},
        
        // Background and personality
        backstory: apiChar.backstory,
        personalityTrait: apiChar.personality_traits,
        
        // Portrait - use API values
        originalPortraitUrl: apiChar.original_portrait_url,
        asciiPortrait: apiChar.custom_portrait_ascii || apiChar.ascii_portrait,
        
        // Metadata
        createdAt: apiChar.created_at || nowIso,
        updatedAt: apiChar.updated_at || nowIso,
      };
    },

    // Check if a character is a demo character
    isDemo(character) {
      return character && (
        character.isDemo === true ||
        (character.id && String(character.id).startsWith(DEMO_PREFIX))
      );
    },

    // Check if user is in demo mode (not authenticated)
    isDemoMode() {
      return !(global.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated());
    },

    // Check if migration prompt has been shown
    hasMigrationBeenAsked() {
      return localStorage.getItem(DEMO_MIGRATION_ASKED_KEY) === 'true';
    },

    // Mark migration prompt as shown
    markMigrationAsked() {
      localStorage.setItem(DEMO_MIGRATION_ASKED_KEY, 'true');
    },

    // Clear migration asked flag (for testing)
    clearMigrationAsked() {
      localStorage.removeItem(DEMO_MIGRATION_ASKED_KEY);
    },

    // Get all demo characters (cached so ASCII can be patched)
    // Returns API characters if available, otherwise falls back to hardcoded
    getAll() {
      // If we have API characters, use those
      if (_apiDemoCharacters && _apiDemoCharacters.length > 0) {
        return _apiDemoCharacters;
      }
      
      // Fall back to hardcoded characters
      if (!_demoCharactersCache) {
        _demoCharactersCache = [
          this._createLyra(),
          this._createThorgrim(),
          this._createZephyr(),
          this._createSienna(),
          this._createKrazul(),
        ];
      }
      return _demoCharactersCache;
    },

    /**
     * Get all demo characters, fetching from API first.
     * Use this async version when you want to ensure API characters are loaded.
     * @returns {Promise<Array>} Array of demo characters
     */
    async getAllAsync() {
      // Try to fetch from API first
      const apiChars = await this.fetchFromApi();
      if (apiChars && apiChars.length > 0) {
        return apiChars;
      }
      // Fall back to hardcoded characters
      return this.getAll();
    },

    // Get count of demo characters that would be migrated
    getDemoCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => this.isDemo(c)).length;
    },

    // Get count of user-created (non-demo) local characters
    getUserCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => !this.isDemo(c)).length;
    },

    // Check if user has reached the character limit in demo mode
    hasReachedCharacterLimit() {
      if (!this.isDemoMode()) return false;
      return this.getUserCharacterCount() >= DEMO_MAX_USER_CHARACTERS;
    },

    // Check if custom art generation is allowed for a character
    // Note: Daily portrait limits are now enforced by the backend.
    // This function only checks if the character type allows custom art.
    canGenerateCustomArt(character) {
      // Sample characters cannot have custom art generated
      if (this.isDemo(character)) {
        return false;
      }
      // All other characters can have custom art (backend enforces daily quota)
      return true;
    },

    // ========================================
    // DEMO CHARACTER 1: Lyra Starwhisper
    // ========================================
    // Female Elf Wizard - scholarly and mystical
    _createLyra() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}lyra`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}lyra_starwhisper`,
        name: 'Lyra Starwhisper',
        race: 'elf',
        class: 'wizard',
        background: 'sage',
        alignment: 'ng',
        sex: 'female',
        level: 5,
        
        // Abilities (point buy optimized for wizard)
        abilities: {
          str: 8,
          dex: 14,
          con: 13,
          int: 17,  // Primary stat + racial bonus
          wis: 12,
          cha: 10,
        },
        baseAbilities: {
          str: 8,
          dex: 12,  // Before racial +2
          con: 13,
          int: 17,
          wis: 12,
          cha: 10,
        },
        
        // Computed stats
        hitPoints: 27,  // 6 + 4*4 + 5*1 (CON mod) = 27
        armorClass: 12, // 10 + DEX mod
        initiative: 2,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 3,
          wis: 1,
          cha: 0,
        },
        
        // Skills
        skillProficiencies: ['arcana', 'history', 'investigation', 'insight'],
        skillModifiers: {
          arcana: 6,      // INT + prof
          history: 6,     // INT + prof (sage)
          investigation: 6,
          insight: 4,     // WIS + prof (sage)
          perception: 3,  // WIS + racial keen senses
        },
        
        // Saving throws
        savingThrows: ['int', 'wis'],
        savingThrowModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 6,  // Proficient
          wis: 4,  // Proficient
          cha: 0,
        },
        
        // Languages
        languages: ['Common', 'Elvish', 'Draconic', 'Celestial'],
        
        // Equipment
        equipment: [
          'Spellbook',
          'Arcane focus (crystal orb)',
          'Scholar\'s pack',
          'Dagger',
          'Component pouch',
          'Bottle of black ink',
          'Quill',
          'Robes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'int',
        cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation', 'Light'],
        spellsKnown: [
          'Magic Missile',
          'Shield',
          'Detect Magic',
          'Mage Armor',
          'Misty Step',
          'Hold Person',
          'Fireball',
          'Counterspell',
        ],
        spellSlots: {
          1: 4,
          2: 3,
          3: 2,
        },
        
        // Race data
        raceData: {
          name: 'Elf',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
          languages: ['Common', 'Elvish'],
        },
        
        // Class data
        classData: {
          name: 'Wizard',
          hitDie: 6,
          primaryAbility: ['int'],
          savingThrows: ['int', 'wis'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Sage',
          feature: {
            name: 'Researcher',
            description: 'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it.',
          },
        },
        
        // Personality
        backstory: 'Lyra spent decades studying in the Silverspire Academy, where she discovered an ancient tome that hinted at forgotten magic from before the Sundering. Now she travels the realm, seeking fragments of lost arcane knowledge.',
        personalityTrait: 'I\'m convinced there\'s a logical explanation for everything, and I won\'t rest until I find it.',
        
        // Portrait - uses default portrait from R2
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults/elf-wizard.png',
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 2: Thorgrim Ironforge
    // ========================================
    // Male Dwarf Fighter - classic warrior tank
    _createThorgrim() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}thorgrim`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}thorgrim_ironforge`,
        name: 'Thorgrim Ironforge',
        race: 'dwarf',
        class: 'fighter',
        background: 'soldier',
        alignment: 'lg',
        sex: 'male',
        level: 3,
        
        // Abilities (strong and tough)
        abilities: {
          str: 16,
          dex: 12,
          con: 16,  // +2 racial
          int: 10,
          wis: 13,
          cha: 8,
        },
        baseAbilities: {
          str: 16,
          dex: 12,
          con: 14,
          int: 10,
          wis: 13,
          cha: 8,
        },
        
        // Computed stats
        hitPoints: 31,  // 10 + 2*6 + 3*3 = 31 (with CON mod)
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 1,
        speed: 25,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 1,
          con: 3,
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'perception', 'survival'],
        skillModifiers: {
          athletics: 5,     // STR + prof
          intimidation: 1,  // CHA + prof
          perception: 3,    // WIS + prof
          survival: 3,      // WIS + prof
        },
        
        // Saving throws
        savingThrows: ['str', 'con'],
        savingThrowModifiers: {
          str: 5,  // Proficient
          dex: 1,
          con: 5,  // Proficient
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Languages
        languages: ['Common', 'Dwarvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Battleaxe',
          'Handaxes (2)',
          'Explorer\'s pack',
          'Insignia of rank',
          'Trophy from fallen enemy',
          'Bone dice',
        ],
        
        // Race data
        raceData: {
          name: 'Dwarf',
          size: 'Medium',
          speed: 25,
          traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
          languages: ['Common', 'Dwarvish'],
        },
        
        // Class data
        classData: {
          name: 'Fighter',
          hitDie: 10,
          primaryAbility: ['str', 'dex'],
          savingThrows: ['str', 'con'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Soldier',
          feature: {
            name: 'Military Rank',
            description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence.',
          },
        },
        
        // Personality
        backstory: 'Thorgrim served twenty years in the Ironforge Legion, defending the mountain holds from orc raids and goblin incursions. After the Battle of Redstone Pass, where he was the sole survivor of his unit, he set out to forge his own legend.',
        personalityTrait: 'I face problems head-on. A simple, direct solution is the best path to success.',
        
        // Portrait - uses default portrait from R2
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults/dwarf-fighter.png',
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 3: Zephyr Nightshade
    // ========================================
    // Non-binary Tiefling Rogue - stealthy and charismatic
    _createZephyr() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}zephyr`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}zephyr_nightshade`,
        name: 'Zephyr Nightshade',
        race: 'tiefling',
        class: 'rogue',
        background: 'criminal',
        alignment: 'cn',
        sex: 'non-binary',
        level: 4,
        
        // Abilities (quick and charming)
        abilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 14,  // +1 racial
          wis: 10,
          cha: 15,  // +2 racial
        },
        baseAbilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 13,
          wis: 10,
          cha: 13,
        },
        
        // Computed stats
        hitPoints: 27,  // 8 + 3*5 + 4*1 = 27
        armorClass: 14, // Leather (11) + DEX mod (3)
        initiative: 3,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 0,
          dex: 3,
          con: 1,
          int: 2,
          wis: 0,
          cha: 2,
        },
        
        // Skills (rogues get 4 + 2 from background)
        skillProficiencies: ['acrobatics', 'deception', 'sleight-of-hand', 'stealth', 'perception', 'persuasion'],
        skillModifiers: {
          acrobatics: 5,      // DEX + prof
          deception: 4,       // CHA + prof
          'sleight-of-hand': 7, // DEX + prof + expertise
          stealth: 7,         // DEX + prof + expertise
          perception: 2,      // WIS + prof
          persuasion: 4,      // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['dex', 'int'],
        savingThrowModifiers: {
          str: 0,
          dex: 5,  // Proficient
          con: 1,
          int: 4,  // Proficient
          wis: 0,
          cha: 2,
        },
        
        // Languages
        languages: ['Common', 'Infernal', 'Thieves\' Cant'],
        
        // Tool proficiencies
        toolProficiencies: ['Thieves\' tools', 'Playing cards'],
        
        // Equipment
        equipment: [
          'Leather armor',
          'Rapier',
          'Shortbow',
          'Arrows (20)',
          'Thieves\' tools',
          'Burglar\'s pack',
          'Crowbar',
          'Dark hooded cloak',
        ],
        
        // Race data
        raceData: {
          name: 'Tiefling',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
          languages: ['Common', 'Infernal'],
        },
        
        // Class data
        classData: {
          name: 'Rogue',
          hitDie: 8,
          primaryAbility: ['dex'],
          savingThrows: ['dex', 'int'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Criminal',
          feature: {
            name: 'Criminal Contact',
            description: 'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances.',
          },
        },
        
        // Personality
        backstory: 'Zephyr grew up on the streets of Waterdeep, their infernal appearance making them an outcast from birth. They learned to survive through cunning and quick fingers, eventually joining the Shadow Thieves. Now they work independently, taking jobs that interest them and staying one step ahead of the law.',
        personalityTrait: 'I have a joke for every occasion, especially occasions where humor is inappropriate.',
        
        // Portrait - uses default portrait from R2
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults/tiefling-rogue.png',
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 4: Sienna Dawnbringer
    // ========================================
    // Female Human Cleric - compassionate healer
    _createSienna() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}sienna`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}sienna_dawnbringer`,
        name: 'Sienna Dawnbringer',
        race: 'human',
        class: 'cleric',
        background: 'acolyte',
        alignment: 'lg',
        sex: 'female',
        level: 4,
        
        // Abilities (wisdom-focused healer)
        abilities: {
          str: 12,
          dex: 10,
          con: 14,
          int: 11,
          wis: 17,
          cha: 14,
        },
        baseAbilities: {
          str: 11,  // +1 human
          dex: 9,   // +1 human
          con: 13,  // +1 human
          int: 10,  // +1 human
          wis: 16,  // +1 human
          cha: 13,  // +1 human
        },
        
        // Computed stats
        hitPoints: 31,  // 8 + 3*5 + 4*2 = 31
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 3,
          cha: 2,
        },
        
        // Skills
        skillProficiencies: ['insight', 'medicine', 'religion', 'persuasion'],
        skillModifiers: {
          insight: 5,     // WIS + prof
          medicine: 5,    // WIS + prof
          religion: 2,    // INT + prof
          persuasion: 4,  // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 5,  // Proficient
          cha: 4,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Celestial', 'Elvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Mace',
          'Holy symbol of Lathander',
          'Prayer book',
          'Incense sticks (5)',
          'Vestments',
          'Healer\'s kit',
        ],
        
        // Spellcasting
        spellcastingAbility: 'wis',
        cantrips: ['Sacred Flame', 'Spare the Dying', 'Guidance'],
        spellsKnown: [
          'Cure Wounds',
          'Bless',
          'Shield of Faith',
          'Healing Word',
          'Lesser Restoration',
          'Spiritual Weapon',
          'Prayer of Healing',
        ],
        spellSlots: {
          1: 4,
          2: 3,
        },
        
        // Race data
        raceData: {
          name: 'Human',
          size: 'Medium',
          speed: 30,
          traits: ['Extra Language', 'Versatile (+1 to all abilities)'],
          languages: ['Common', 'one extra'],
        },
        
        // Class data
        classData: {
          name: 'Cleric',
          hitDie: 8,
          primaryAbility: ['wis'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Acolyte',
          feature: {
            name: 'Shelter of the Faithful',
            description: 'You can receive free healing and care at temples of your faith, and you can call upon priests for assistance.',
          },
        },
        
        // Personality
        backstory: 'Sienna was orphaned during a plague that swept through her village. Taken in by the Temple of Lathander, she devoted her life to ensuring no one else would suffer as she had. Now she travels the land, bringing hope and healing wherever darkness threatens.',
        personalityTrait: 'I see omens in every event and action. The gods are always speaking to us, we just need to listen.',
        
        // Portrait - uses default portrait from R2
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults/human-cleric.png',
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 5: Krazul Stormscale
    // ========================================
    // Male Dragonborn Paladin - noble dragon knight
    _createKrazul() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}krazul`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}krazul_stormscale`,
        name: 'Krazul Stormscale',
        race: 'dragonborn',
        class: 'paladin',
        background: 'noble',
        alignment: 'lg',
        sex: 'male',
        level: 5,
        
        // Abilities (strong and charismatic)
        abilities: {
          str: 17,  // +2 racial
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 16,  // +1 racial
        },
        baseAbilities: {
          str: 15,
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 15,
        },
        
        // Computed stats
        hitPoints: 44,  // 10 + 4*6 + 5*2 = 44
        armorClass: 18, // Chain mail (16) + shield (+2) or plate (18)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 1,
          cha: 3,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'persuasion', 'history'],
        skillModifiers: {
          athletics: 6,    // STR + prof
          intimidation: 6, // CHA + prof
          persuasion: 6,   // CHA + prof
          history: 3,      // INT + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 4,  // Proficient
          cha: 6,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Draconic'],
        
        // Equipment
        equipment: [
          'Plate armor',
          'Shield',
          'Longsword',
          'Javelins (5)',
          'Holy symbol embedded in shield',
          'Signet ring of House Stormscale',
          'Fine clothes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'cha',
        cantrips: [],
        spellsKnown: [
          'Divine Smite',
          'Thunderous Smite',
          'Shield of Faith',
          'Cure Wounds',
          'Command',
          'Find Steed',
        ],
        spellSlots: {
          1: 4,
          2: 2,
        },
        
        // Race data
        raceData: {
          name: 'Dragonborn',
          size: 'Medium',
          speed: 30,
          traits: ['Draconic Ancestry (Blue)', 'Breath Weapon (Lightning)', 'Damage Resistance (Lightning)'],
          languages: ['Common', 'Draconic'],
        },
        
        // Class data
        classData: {
          name: 'Paladin',
          hitDie: 10,
          primaryAbility: ['str', 'cha'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Noble',
          feature: {
            name: 'Position of Privilege',
            description: 'Thanks to your noble birth, people are inclined to think the best of you. Common folk make every effort to accommodate you.',
          },
        },
        
        // Personality
        backstory: 'Krazul hails from an ancient dragonborn clan that once served as dragon knights in a forgotten empire. When his clan\'s honor was questioned by corrupt nobles, he swore an oath to restore their name through righteous deeds. His lightning breath crackles with ancestral power.',
        personalityTrait: 'My favor, once lost, is lost forever. But my loyalty, once earned, is unshakeable.',
        
        // Portrait - uses default portrait from R2
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/defaults/dragonborn-paladin.png',
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },
  });
})(window);




// ===== BUNDLE PART: character-storage.js =====

// ========================================
// SHARED CHARACTER STORAGE FACADE
// ========================================
// Unified hybrid storage (cloud + local) used by:
// - Character Manager (full-screen app)
// - Character Builder (for future consolidation)
//
// Responsibilities:
// - Decide between cloud API and local storage based on AuthService
// - Provide a stable character model for frontend code
// - Normalize timestamps so sorting by "date modified" is reliable
//
// Dependencies (if available on the current page):
// - window.AuthService          (auth state)
// - window.CharacterCloudStorage (cloud CRUD, from character-manager-api.js)
// - window.DanddyStorage        (local storage abstraction)
// ========================================

(function () {
  const DEBUG_STORAGE = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

  const CharacterStorage = (window.CharacterStorage = {
    STORAGE_KEY:
      (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) ||
      'dnd_characters',

    // Check if user is authenticated and should use cloud
    useCloud() {
      return (
        window.AuthService && typeof AuthService.isAuthenticated === 'function'
          ? AuthService.isAuthenticated()
          : false
      );
    },

    // Get all characters (cloud or local)
    async getAll() {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching all characters from cloud...');
          }
          return await window.CharacterCloudStorage.getAll();
        } catch (error) {
          // If session expired, dispatch event and re-throw instead of silently falling back
          if (error.message && error.message.includes('Session expired')) {
            console.warn('☁️ STORAGE: Session expired during getAll, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'getAll' },
            });
            window.dispatchEvent(event);
            // Re-throw so caller can handle
            throw error;
          }
          // For other errors (network issues, etc.), fall back to local
          console.error(
            '☁️ STORAGE: Cloud getAll failed, falling back to local:',
            error,
          );
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '⚠️ Cloud sync failed. Showing local characters instead.',
            );
          }
          return this._getLocalAll();
        }
      }
      return this._getLocalAll();
    },

    // Get single character by ID
    async getById(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching character from cloud:', id);
          }
          return await window.CharacterCloudStorage.getById(id);
        } catch (error) {
          // If session expired, dispatch event and re-throw instead of silently falling back
          // This allows the UI to show the session expired modal
          if (error.message && error.message.includes('Session expired')) {
            console.warn('☁️ STORAGE: Session expired during getById, dispatching event');
            // Dispatch event so UI can react
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'getById' },
            });
            window.dispatchEvent(event);
            // Re-throw so caller can handle (e.g., show modal)
            throw error;
          }
          // For other errors (network issues, etc.), fall back to local
          console.error(
            '☁️ STORAGE: Cloud getById failed, falling back to local:',
            error,
          );
          return this._getLocalById(id);
        }
      }
      return this._getLocalById(id);
    },

    // Add new character
    async add(character) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Creating character in cloud:', character);
          }
          return await window.CharacterCloudStorage.add(character);
        } catch (error) {
          // If session expired, dispatch event and re-throw - don't create local duplicate
          if (error.message && error.message.includes('Session expired')) {
            console.warn('☁️ STORAGE: Session expired during add, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'add' },
            });
            window.dispatchEvent(event);
            throw error;
          }
          // For other errors (network issues), fall back to local add
          console.error('☁️ STORAGE: Cloud add failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to save to cloud. Saving locally instead.',
            );
          }
          // Fall through to local add
        }
      }
      return this._localAdd(character);
    },

    /**
     * Update existing character
     * @param {string} id - Character ID
     * @param {Object} updates - Fields to update
     * @param {Object} options - { silent?: boolean } - if true, don't update modified timestamp
     */
    async update(id, updates, options = {}) {
      const { silent = false } = options;
      const idStr = String(id);

      if (this.useCloud() && window.CharacterCloudStorage) {
        // Guard against invalid cloud IDs (e.g. "null", "undefined", or local-only IDs)
        const isInvalidCloudId =
          !idStr ||
          idStr === 'null' ||
          idStr === 'undefined' ||
          idStr.startsWith('local_');

        if (isInvalidCloudId) {
          if (DEBUG_STORAGE) {
            console.warn(
              '⚠️ STORAGE: Skipping cloud update for invalid id; using local instead:',
              id,
            );
          }
          return this._localUpdate(id, updates, { silent });
        }

        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Updating character in cloud:', id);
          }
          return await window.CharacterCloudStorage.update(id, updates);
        } catch (error) {
          // If session expired, dispatch event for UI handling
          if (error.message && error.message.includes('Session expired')) {
            console.warn('☁️ STORAGE: Session expired during update, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'update' },
            });
            window.dispatchEvent(event);
            throw error;
          }
          // For other errors, show notification and re-throw
          console.error('☁️ STORAGE: Cloud update failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to update in cloud. Your changes may not be synced.',
            );
          }
          throw error;
        }
      }

      return this._localUpdate(id, updates, { silent });
    },

    // Delete character
    async delete(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Deleting character from cloud:', id);
          }
          await window.CharacterCloudStorage.delete(id);
          return true;
        } catch (error) {
          console.error('☁️ STORAGE: Cloud delete failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to delete from cloud. Please try again.',
            );
          }
          throw error;
        }
      }

      return this._localDelete(id);
    },

    // Duplicate character
    async duplicate(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Duplicating character in cloud:', id);
          }
          return await window.CharacterCloudStorage.duplicate(id);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud duplicate failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to duplicate in cloud. Please try again.',
            );
          }
          throw error;
        }
      }

      return this._localDuplicate(id);
    },

    // Export character as JSON
    async export(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Exporting character from cloud:', id);
          }
          return await window.CharacterCloudStorage.export(id);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud export failed, falling back to local:', error);
          const character = this._getLocalById(id);
          return character ? JSON.stringify(character, null, 2) : null;
        }
      }

      const character = this._getLocalById(id);
      return character ? JSON.stringify(character, null, 2) : null;
    },

    // Import character from JSON
    async import(jsonString) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Importing character to cloud...');
          }
          return await window.CharacterCloudStorage.import(jsonString);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud import failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to import to cloud. Please try again.',
            );
          }
          return null;
        }
      }

      return this._localImport(jsonString);
    },

    // Generate unique ID for local-only characters
    generateId() {
      return `char_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    },

    // ========================================
    // LOCAL STORAGE IMPLEMENTATIONS (Fallback)
    // ========================================

    _getLocalAll() {
      let characters =
        (window.DanddyStorage && window.DanddyStorage.readAll()) ||
        (function () {
          try {
            const data = localStorage.getItem(CharacterStorage.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
          } catch {
            return [];
          }
        })();

      if (DEBUG_STORAGE) {
        console.log(
          '💾 LOCAL.GETALL: Retrieved',
          characters.length,
          'characters from local storage',
        );
      }

      // Normalize timestamps so we can reliably sort by recency.
      // Only normalize non-demo characters (demo chars have their own timestamps).
      let changed = false;
      let maxExistingTime = 0;

      // First pass: find the most recent existing timestamp (if any)
      characters.forEach((char) => {
        const t = new Date(char.updatedAt || char.createdAt || 0).getTime();
        if (t > maxExistingTime) {
          maxExistingTime = t;
        }
      });

      const baseTime = maxExistingTime || Date.now();
      let newCounter = 0;

      characters.forEach((char) => {
        // Skip demo characters - they have their own timestamps
        if (window.DemoCharacters && window.DemoCharacters.isDemo(char)) {
          return;
        }
        
        if (!char.createdAt) {
          // Treat characters without timestamps as newer than anything we've seen
          newCounter += 1;
          const t = baseTime + newCounter * 1000;
          char.createdAt = new Date(t).toISOString();
          changed = true;
        }
        if (!char.updatedAt) {
          char.updatedAt = char.createdAt;
          changed = true;
        }
      });

      if (changed) {
        try {
          // Only save non-demo characters to localStorage
          const charsToSave = characters.filter(c => 
            !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
          );
          localStorage.setItem(
            this.STORAGE_KEY,
            JSON.stringify(charsToSave),
          );
        } catch (e) {
          console.warn('LOCAL.GETALL: Failed to persist normalized timestamps', e);
        }
      }

      // In demo mode (not authenticated), inject demo characters
      if (!this.useCloud() && window.DemoCharacters) {
        const demoChars = window.DemoCharacters.getAll();
        const existingDemoIds = new Set(
          characters
            .filter(c => window.DemoCharacters.isDemo(c))
            .map(c => c.id)
        );
        
        // Add any missing demo characters (in memory only)
        demoChars.forEach(demo => {
          if (!existingDemoIds.has(demo.id)) {
            characters.push(demo);
          }
        });
      }

      return characters;
    },

    _getLocalById(id) {
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      return characters.find((char) => char && String(char.id) === idStr);
    },

    _localSaveAll(characters) {
      // Filter out demo characters - they should never be persisted
      const charsToSave = characters.filter(c => 
        !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
      );
      
      if (DEBUG_STORAGE) {
        console.log(
          '💾 LOCAL.SAVEALL: Saving',
          charsToSave.length,
          'characters to local storage (excluding demo)',
        );
      }

      if (window.DanddyStorage) {
        window.DanddyStorage.writeAll(charsToSave);
      } else {
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(charsToSave));
        } catch (e) {
          console.warn('LOCAL.SAVEALL: Failed to write to localStorage', e);
        }
      }
    },

    _localAdd(character) {
      if (DEBUG_STORAGE) {
        console.log('💾 LOCAL.ADD: Adding character:', character.name);
      }
      const characters = this._getLocalAll();
      const nowIso = new Date().toISOString();
      const withId = {
        ...character,
        id: character.id || this.generateId(),
        createdAt: character.createdAt || nowIso,
        updatedAt: character.updatedAt || nowIso,
      };
      characters.push(withId);
      this._localSaveAll(characters);
      return withId;
    },

    _localUpdate(id, updates, options = {}) {
      const { silent = false } = options;
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      const index = characters.findIndex((char) => char && String(char.id) === idStr);
      if (index === -1) return null;

      const prev = characters[index];

      const next = {
        ...prev,
        ...updates,
        ...(silent ? {} : { updatedAt: new Date().toISOString() }),
      };

      characters[index] = next;
      this._localSaveAll(characters);
      return next;
    },

    _localDelete(id) {
      if (DEBUG_STORAGE) {
        console.log('🗑️ LOCAL.DELETE: Deleting character with ID:', id);
      }
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      const filtered = characters.filter((char) => !char || String(char.id) !== idStr);
      this._localSaveAll(filtered);
      return filtered.length < characters.length;
    },

    _localDuplicate(id) {
      const character = this._getLocalById(id);
      if (!character) return null;

      const nowIso = new Date().toISOString();
      const duplicate = {
        ...character,
        name: character.name ? `${character.name}(Copy)` : 'Copy',
        id: this.generateId(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const characters = this._getLocalAll();
      characters.push(duplicate);
      this._localSaveAll(characters);
      return duplicate;
    },

    _localImport(jsonString) {
      try {
        if (DEBUG_STORAGE) {
          console.log('📥 LOCAL.IMPORT: Starting import...');
        }

        const character = JSON.parse(jsonString);
        if (!character || typeof character !== 'object') {
          throw new Error('Invalid character JSON');
        }

        // Ensure imported characters get a fresh ID/timestamps on this device
        delete character.id;
        const result = this._localAdd(character);

        if (DEBUG_STORAGE) {
          console.log(
            '📥 LOCAL.IMPORT: Imported character with new ID:',
            result.id,
          );
        }

        return result;
      } catch (error) {
        console.error('LOCAL.IMPORT: Failed to import character JSON', error);
        return null;
      }
    },
  });
})();





// ===== BUNDLE PART: portraits-ui.js =====

// ========================================
// SHARED PORTRAIT UI MODULE
// - Portrait history modal
// - Keyboard navigation
// - ASCII/original toggle
//
// Used by: Character Manager (and later Character Builder)
// ========================================

(function () {
  const state = {
    context: null, // { type: 'manager', characterId }
    focusIndex: 0,
    escHandler: null,
    keyHandler: null,
  };

  const PortraitUI = (window.PortraitUI = {
    /**
     * Open the portrait history modal for a manager character.
     * @param {string} characterId
     */
    async openManagerHistory(characterId) {
      if (!characterId) return;

      // Avoid duplicate modals
      if (document.getElementById('portraitHistoryModal')) {
        return;
      }

      // Prefer the in-memory manager cache first so we avoid extra localStorage
      // scans or cloud round-trips whenever the character grid has already
      // loaded this character.
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character =
            AppState.characters.find(
              (c) =>
                c &&
                (c.id === characterId ||
                  String(c.id) === String(characterId)),
            ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage facade below.
      }

      // Fallback to hybrid storage facade when the character is not present
      // in the current AppState cache (for example, when opening history
      // from a context that hasn't loaded the grid).
      if (!character) {
        const CharacterStorage = window.CharacterStorage;
        if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
          console.warn(
            'PortraitUI.openManagerHistory: CharacterStorage.getById is not available',
          );
          this.closeHistory();
          return;
        }

        try {
          character = await CharacterStorage.getById(characterId);
        } catch (e) {
          console.error(
            'PortraitUI.openManagerHistory: CharacterStorage.getById failed',
            e,
          );
          this.closeHistory();
          return;
        }
      }

      if (!character) {
        console.warn(
          'PortraitUI.openManagerHistory: character not found for id',
          characterId,
        );
        this.closeHistory();
        return;
      }

      // Normalize metadata + versions using shared helper so builder and
      // manager stay in sync. Fall back to a simple inline version if the
      // helper is unavailable for any reason.
      const normalized =
        window.PortraitHistory &&
        typeof PortraitHistory.normalizeForDisplay === 'function'
          ? PortraitHistory.normalizeForDisplay(character)
          : (() => {
              const fallbackMetadata = character.portraitMetadata || {};
              const fallbackRaw = Array.isArray(fallbackMetadata.versions)
                ? fallbackMetadata.versions
                : [];
              return {
                metadata: fallbackMetadata,
                versions: fallbackRaw,
                hasVersions: fallbackRaw.length > 0,
                hasCustomPortraitWithoutHistory: !fallbackRaw.length,
              };
            })();

      const metadata = normalized.metadata;
      const versions = normalized.versions;
      const hasVersions = normalized.hasVersions;

      // Debug hook to verify manager history is opening with the expected data.
      try {
        console.log('%c🎨 MANAGER PORTRAIT HISTORY OPEN', 'color:#0ff;font-weight:bold;');
        console.log('  Character ID:', characterId);
        console.log('  Versions count:', versions.length);
        console.log('  Active version ID:', metadata.activeVersionId || '(none)');
      } catch (e) {
        // Non-fatal logging failure
      }

      // If the character already has a custom portrait but no version history yet,
      // show a helpful empty state rather than the generic "no saved portraits" copy.
      const hasCustomPortraitWithoutHistory =
        normalized.hasCustomPortraitWithoutHistory;

      state.context = {
        type: 'manager',
        characterId,
        metadata,
        // Store the display-ordered versions so focus/index updates match
        // the DOM order.
        versions,
        hasCustomPortraitWithoutHistory,
      };

      const listHtml = this._buildHistoryCardsHtml(
        'manager',
        characterId,
        metadata,
        versions,
        hasCustomPortraitWithoutHistory,
      );

      // Build and insert the full modal once data is ready so there is no
      // intermediate loading skeleton state.
      const modalHtml = `<div id="portraitHistoryModal"class="modal show"onclick="PortraitUI.closeHistory()"><div class="modal-content portrait-history-modal"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Portrait History</h2><button class="modal-close"onclick="PortraitUI.closeHistory()">&times;</button></div><div class="modal-body"><p class="terminal-text-small terminal-text-dim">View previous custom AI portraits for this character.${' '}Choose one to make it active,${' '}or delete versions you no longer need.</p><div class="portrait-history-carousel">${versions.length>1?`<button
                        type="button"
                        class="portrait-history-nav portrait-history-nav-left"
                        aria-label="Previous portrait"
                        aria-controls="portraitHistoryList"
                        onclick="event.stopPropagation(); PortraitUI.moveFocus(-1);"
                      >
                        <span aria-hidden="true">‹</span>
                      </button>`:''}<div
id="portraitHistoryList"
class="portrait-history-card-row${versions.length===1?' is-single':''}">${listHtml}</div>${versions.length>1?`<button
                        type="button"
                        class="portrait-history-nav portrait-history-nav-right"
                        aria-label="Next portrait"
                        aria-controls="portraitHistoryList"
                        onclick="event.stopPropagation(); PortraitUI.moveFocus(1);"
                      >
                        <span aria-hidden="true">›</span>
                      </button>`:''}</div></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="PortraitUI.closeHistory()">CANCEL</button><button class="terminal-btn terminal-btn-primary"onclick="PortraitUI.confirmSelection()">USE SELECTED</button></div></div></div>`;

      // Attach the portrait history modal to the terminal frame/container so
      // its overlay and content stay within the app window instead of the
      // full browser viewport.
      const host =
        document.querySelector('.terminal-frame') ||
        document.querySelector('.terminal-container') ||
        document.body;
      host.insertAdjacentHTML('beforeend', modalHtml);

      this._populateAsciiPreviews(versions);
      this._initKeyboardFocus();
      this._attachKeyboardHandlers();
    },

    /**
     * Shared ASCII thumbnail cropping.
     * Prefer any host-provided implementation (UI.cropAsciiForThumbnail) and
     * fall back to the standard race/class portrait cropping heuristic.
     */
    cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
      try {
        if (window.UI && typeof window.UI.cropAsciiForThumbnail === 'function') {
          return window.UI.cropAsciiForThumbnail(asciiArt, heightLines, widthChars);
        }
      } catch (e) {
        // Non-fatal: fall through to local implementation
      }

      if (!asciiArt || typeof asciiArt !== 'string') return '';

      const lines = asciiArt.split('\n');
      const totalLines = lines.length;
      const startLine = 0; // Keep top pinned (faces/heads)
      const endLine = Math.min(totalLines, heightLines);

      // HORIZONTAL: Crop equally from both sides to stay centered
      const topLines = lines.slice(startLine, endLine).map((line) => {
        if (line.length <= widthChars) return line;
        const excess = line.length - widthChars;
        const cropLeft = Math.floor(excess / 2);
        return line.slice(cropLeft, cropLeft + widthChars);
      });

      return topLines.join('\n');
    },

    /**
     * Shared helper: return a human-readable subtext for the portrait loader
     * based on the currently selected image model (DALL·E 3 vs GPT Image 1).
     *
     * This is used by both the builder and manager so the cube loader's
     * timing hint stays consistent across apps.
     *
     * @returns {string}
     */
    getImageModelSubtext() {
      let subtext = '(This usually takes 20–30 seconds)';
      try {
        let imageModel = 'dall-e-3';
        if (
          window.StorageService &&
          typeof StorageService.getImageModel === 'function'
        ) {
          imageModel = StorageService.getImageModel();
        } else if (
          typeof CONFIG !== 'undefined' &&
          CONFIG.DEFAULT_IMAGE_MODEL
        ) {
          imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }

        if (imageModel === 'gpt-image-1') {
          subtext = '(This can take up to a minute)';
        } else if (imageModel === 'flux-1.1-pro') {
          subtext = '(Flux Pro – usually 10–20 seconds)';
        } else if (imageModel === 'flux-schnell') {
          subtext = '(Flux Schnell – usually 5–10 seconds)';
        }
      } catch (e) {
        // Fall back to default subtext on any error.
      }
      return subtext;
    },

    /**
     * Shared portrait "cube" loader for the character sheet portrait area.
     *
     * Normalizes the portrait container and ensures that the fast-spinning
     * cube + status text markup is present. Subsequent calls will *update*
     * the message / subtext / dot state without re-rendering the whole
     * container, so it's safe to call from a timer.
     *
     * @param {HTMLElement} portraitEl
     * @param {{ baseMessage?: string, subtext?: string, dotCount?: number, isLoading?: boolean }} options
     * @returns {HTMLElement|null} the `.portrait-placeholder-text` element
     */
    renderGeneratingLoader(portraitEl, options) {
      if (!portraitEl) return null;

      const opts = options || {};
      const baseMessage = opts.baseMessage || 'Generating character art';
      const subtext =
        opts.subtext || this.getImageModelSubtext() || '(This usually takes 20–30 seconds)';
      const dotCount = Number.isFinite(opts.dotCount) ? opts.dotCount : 1;
      const isLoading = opts.isLoading !== false;

      // Normalize container classes so cube styles work consistently.
      portraitEl.classList.add('ascii-portrait--placeholder');
      if (isLoading) {
        portraitEl.classList.add('ascii-portrait--loading');
      }

      // Ensure the cube + text shell exists once; thereafter only update text.
      // Check for the --generating class on the cube to know if loader is rendered,
      // not just .portrait-placeholder-text which exists in the waiting placeholder too.
      const hasLoader = portraitEl.querySelector('.portrait-placeholder-cube--generating');
      let textEl = portraitEl.querySelector('.portrait-placeholder-text');
      if (!hasLoader) {
        portraitEl.innerHTML = `<div class="portrait-placeholder-content"><div class="portrait-placeholder-cube-container"><div class="portrait-placeholder-cube portrait-placeholder-cube--generating"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="portrait-placeholder-text"data-dots="${dotCount}"><span class="portrait-placeholder-message">${baseMessage}</span><span class="portrait-placeholder-dots"><span class="dot dot-1">.</span><span class="dot dot-2">.</span><span class="dot dot-3">.</span></span><div class="portrait-placeholder-subtext">${subtext}</div></div></div>`;
        textEl = portraitEl.querySelector('.portrait-placeholder-text');
      } else {
        // Update text + dot state without reconstructing DOM.
        textEl.setAttribute('data-dots', String(dotCount));
        const messageEl =
          textEl.querySelector('.portrait-placeholder-message');
        if (messageEl) {
          messageEl.textContent = baseMessage;
        }
        const subtextEl =
          textEl.querySelector('.portrait-placeholder-subtext');
        if (subtextEl) {
          subtextEl.textContent = subtext;
        }
      }

      return textEl || null;
    },

    // ========================================
    // PUBLIC UI ACTIONS (used by onclick="")
    // ========================================

    closeHistory() {
      // Close any open overflow menus in the modal first
      const openShells = document.querySelectorAll('.portrait-history-modal .selector-shell.is-open');
      openShells.forEach((shell) => {
        const menu = shell._detachedMenu || shell.querySelector('.selector-menu');
        const trigger = shell.querySelector('.selector-trigger');
        
        if (menu && menu._originalParent) {
          // Restore detached menus before removing modal
          menu.classList.remove('portrait-history-menu-detached');
          menu.classList.remove('portrait-history-menu-detached--teal');
          menu._originalParent.appendChild(menu);
          delete menu._originalParent;
          delete shell._detachedMenu;
        }
        
        if (trigger) {
          trigger.classList.remove('is-open');
        }
        if (menu) {
          menu.classList.remove('is-open');
          menu.setAttribute('aria-hidden', 'true');
        }
        shell.classList.remove('is-open');
      });
      
      const modal = document.getElementById('portraitHistoryModal');
      if (modal) modal.remove();

      this._detachKeyboardHandlers();
      state.focusIndex = 0;
      state.context = null;
    },

    selectCard(versionId) {
      const cards = this._getCards();
      if (!cards.length) return;

      let targetIndex = 0;
      cards.forEach((card, i) => {
        const matches = card.getAttribute('data-version-id') === versionId;
        if (matches) {
          targetIndex = i;
        }
      });

      state.focusIndex = targetIndex;
      this._updateFocus();
    },

    moveFocus(delta) {
      const cards = this._getCards();
      if (!cards.length) return;

      const current =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;
      const next = Math.max(0, Math.min(cards.length - 1, current + delta));
      state.focusIndex = next;
      this._updateFocus();
    },

    toggleView(versionId) {
      const asciiEl = document.querySelector(
        `.portrait-history-preview.ascii-portrait[data-version-id="${versionId}"]`,
      );
      const imgEl = document.querySelector(
        `.portrait-history-image[data-version-id="${versionId}"]`,
      );
      // The overflow menu may be detached from the card, so look for the
      // button globally instead of limiting to .portrait-history-actions.
      const btn = document.querySelector(
        `button[data-toggle-version-id="${versionId}"]`,
      );
      // Get the card thumbnail container for original mode styling
      const thumbContainer = asciiEl ? asciiEl.closest('.card-thumbnail') : null;

      if (!imgEl || !asciiEl) return;

      const showingAscii = imgEl.classList.contains('is-hidden');

      if (showingAscii) {
        // Switch to original image
        asciiEl.classList.add('is-hidden');
        imgEl.classList.remove('is-hidden');
        if (thumbContainer) {
          thumbContainer.classList.add('card-thumbnail--original-mode');
        }
        if (btn) {
          const label = btn.querySelector('.selector-option-label');
          if (label) {
            label.textContent = 'View ASCII';
          } else {
            btn.textContent = 'View ASCII';
          }
        }
      } else {
        // Switch back to ASCII art
        imgEl.classList.add('is-hidden');
        asciiEl.classList.remove('is-hidden');
        if (thumbContainer) {
          thumbContainer.classList.remove('card-thumbnail--original-mode');
        }
        if (btn) {
          const label = btn.querySelector('.selector-option-label');
          if (label) {
            label.textContent = 'View original';
          } else {
            btn.textContent = 'View original';
          }
        }
      }
    },

    async confirmSelection() {
      const ctx = state.context;
      if (!ctx || ctx.type !== 'manager') {
        this.closeHistory();
        return;
      }

      const cards = this._getCards();
      if (!cards.length) {
        this.closeHistory();
        return;
      }

      const index =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;
      const card = cards[index];
      if (!card) {
        this.closeHistory();
        return;
      }

      const versionId = card.getAttribute('data-version-id');
      if (!versionId) {
        this.closeHistory();
        return;
      }

      // Debug: log which version is being applied.
      try {
        console.log('%c🎨 MANAGER PORTRAIT USE SELECTED', 'color:#0ff;font-weight:bold;');
        console.log('  Character ID:', ctx.characterId);
        console.log('  Selected version ID:', versionId);
      } catch (e) {
        // Non-fatal
      }

      // Show a lightweight inline loading state while we apply the new portrait.
      const modal = document.getElementById('portraitHistoryModal');
      const useBtn =
        modal && modal.querySelector('.modal-footer .terminal-btn-primary');
      const originalLabel = useBtn ? useBtn.textContent : null;
      if (useBtn) {
        useBtn.disabled = true;
        useBtn.textContent = 'Applying...';
      }

      try {
        await this._usePortraitVersionManager(ctx.characterId, versionId);
      } catch (error) {
        console.error(
          'PortraitUI.confirmSelection: failed to apply portrait version',
          error,
        );
        if (typeof window.showNotification === 'function') {
          window.showNotification(
            'Failed to switch portrait. Please try again.',
          );
        }
        // If something went wrong, restore button state so the user can retry.
        if (useBtn) {
          useBtn.disabled = false;
          useBtn.textContent = originalLabel || 'USE SELECTED';
        }
      }
    },

    async viewImageInfo(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      // Prefer AppState cache to ensure we show the most up-to-date data
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
      if (!character) return;

      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const version = versions.find((v) => v.id === versionId);

      if (!version) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('No info available for this portrait.');
        }
        return;
      }

      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      const modalBody = modal.querySelector('.modal-body');
      const modalTitle = modal.querySelector('.modal-title');
      const modalFooter = modal.querySelector('.modal-footer');
      if (!modalBody) return;

      // Store original content to restore on back
      const modalHeader = modal.querySelector('.modal-header');
      const originalBodyHtml = modalBody.innerHTML;
      const originalHeaderHtml = modalHeader ? modalHeader.innerHTML : '';
      const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';
      const originalVersions = state.context?.versions || [];

      // Helper to format labels to title case
      const formatLabel = (str) => {
        if (!str) return null;
        // Replace dashes/underscores with spaces
        let cleaned = str.replace(/[-_]/g, ' ');
        // Title case: capitalize first letter of each word
        if (cleaned.length > 0) {
          cleaned = cleaned.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        }
        return cleaned;
      };

      // Format model name for display
      const formatModelName = (model) => {
        if (!model) return null;
        const modelNames = {
          'dall-e-3': 'DALL·E 3',
          'gpt-image-1': 'GPT Image 1',
          'flux-1.1-pro': 'Flux 1.1 Pro',
          'flux-schnell': 'Flux Schnell',
        };
        return modelNames[model] || formatLabel(model);
      };

      // Format quality for display
      const formatQuality = (quality) => {
        if (!quality) return null;
        const qualityNames = {
          'standard': 'Standard',
          'medium': 'Medium',
          'high': 'High',
          'hd': 'HD',
        };
        return qualityNames[quality] || formatLabel(quality);
      };

      // Format date/time for display
      const formatDateTime = (isoString) => {
        if (!isoString) return null;
        try {
          const date = new Date(isoString);
          return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch (e) {
          return isoString;
        }
      };

      const styleLabel = formatLabel(version.style) || 'Default';
      const modelLabel = formatModelName(version.model);
      const qualityLabel = formatQuality(version.quality);
      const dateTimeLabel = formatDateTime(version.createdAt);

      // Escape prompt text for safe display
      const escapedPrompt = (version.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const infoHeaderHtml = `<h2 class="modal-title">Image Info</h2><button class="modal-close"onclick="PortraitUI.closeHistory()">&times;</button>`;

      // Build the info sections
      let infoSections = '';

      // Date/Time
      if (dateTimeLabel) {
        infoSections += `<div class="image-info-row"><span class="image-info-label">Created</span><span class="image-info-value">${dateTimeLabel}</span></div>`;
      }

      // Style
      infoSections += `<div class="image-info-row"><span class="image-info-label">Style</span><span class="image-info-value">${styleLabel}</span></div>`;

      // Model and Quality
      if (modelLabel) {
        let modelDisplay = modelLabel;
        if (qualityLabel) {
          modelDisplay = modelDisplay + ' (' + qualityLabel + ')';
        }
        infoSections += `<div class="image-info-row"><span class="image-info-label">Model</span><span class="image-info-value">${modelDisplay}</span></div>`;
      }

      // Prompt section
      let promptSection = '';
      if (escapedPrompt) {
        promptSection = `<div class="image-info-prompt-section"><div class="image-info-prompt-label">Prompt</div><pre class="terminal-text portrait-prompt-display">${escapedPrompt}</pre></div>`;
      } else {
        promptSection = `<div class="image-info-prompt-section"><div class="image-info-prompt-label">Prompt</div><p class="terminal-text-dim">No prompt saved for this portrait.</p></div>`;
      }

      const infoBodyHtml = `<div class="image-info-container"><div class="image-info-metadata">${infoSections}</div>${promptSection}</div>`;

      const infoFooterHtml = `<button class="terminal-btn"id="portrait-info-back">BACK</button>${escapedPrompt?'<button class="terminal-btn" id="portrait-info-copy">COPY PROMPT</button>':''}`;

      // Transform modal to info view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalHeader) modalHeader.innerHTML = infoHeaderHtml;
        modalBody.innerHTML = infoBodyHtml;
        if (modalFooter) modalFooter.innerHTML = infoFooterHtml;
      });

      const backBtn = document.getElementById('portrait-info-back');
      const copyBtn = document.getElementById('portrait-info-copy');

      const goBack = () => {
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalHeader) modalHeader.innerHTML = originalHeaderHtml;
          modalBody.innerHTML = originalBodyHtml;
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-populate ASCII previews after restoring
        if (Array.isArray(originalVersions) && originalVersions.length > 0) {
          this._populateAsciiPreviews(originalVersions);
        }

        this._initKeyboardFocus();
      };

      if (backBtn) {
        backBtn.onclick = goBack;
      }

      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(version.prompt);
            } else {
              const textarea = document.createElement('textarea');
              textarea.value = version.prompt;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'absolute';
              textarea.style.left = '-9999px';
              document.body.appendChild(textarea);
              textarea.select();
              try {
                document.execCommand('copy');
              } finally {
                document.body.removeChild(textarea);
              }
            }
            if (typeof window.showNotification === 'function') {
              window.showNotification('Prompt copied to clipboard.');
            }
          } catch (error) {
            console.error('PortraitUI.viewImageInfo: failed to copy prompt', error);
            if (typeof window.showNotification === 'function') {
              window.showNotification('Could not copy prompt.');
            }
          }
        };
      }
    },

    // Legacy alias for backwards compatibility
    async viewPrompt(characterId, versionId) {
      return this.viewImageInfo(characterId, versionId);
    },

    deleteVersion(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      const modalBody = modal.querySelector('.modal-body');
      const modalTitle = modal.querySelector('.modal-title');
      const modalFooter = modal.querySelector('.modal-footer');
      if (!modalBody) return;

      // Store original content to restore on cancel
      const originalBodyHtml = modalBody.innerHTML;
      const originalTitle = modalTitle ? modalTitle.textContent : '';
      const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';
      const originalVersions = state.context?.versions || [];

      // If this is the only portrait, show "create new" prompt instead of delete confirmation
      if (originalVersions.length === 1) {
        const createNewBodyHtml = `<p class="terminal-text">To delete this portrait,create a new one first.</p>`;

        const createNewFooterHtml = `<button class="terminal-btn"id="portrait-delete-cancel">CANCEL</button><button class="terminal-btn terminal-btn-primary"id="portrait-create-new">CREATE NEW</button>`;

        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = 'Create a New Portrait?';
          modalBody.innerHTML = createNewBodyHtml;
          if (modalFooter) modalFooter.innerHTML = createNewFooterHtml;
        });

        const cancelBtn = document.getElementById('portrait-delete-cancel');
        const createNewBtn = document.getElementById('portrait-create-new');

        if (cancelBtn) {
          cancelBtn.onclick = () => {
            this._animateModalContentResize('portraitHistoryModal', () => {
              if (modalTitle) modalTitle.textContent = originalTitle;
              modalBody.innerHTML = originalBodyHtml;
              if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
            });

            // Re-populate ASCII previews after restoring
            if (Array.isArray(originalVersions) && originalVersions.length > 0) {
              this._populateAsciiPreviews(originalVersions);
            }

            this._initKeyboardFocus();
          };
        }

        if (createNewBtn) {
          createNewBtn.onclick = () => {
            this.closeHistory();
            // Trigger portrait generation for this character in the manager context
            if (typeof window.generatePortraitForCharacter === 'function') {
              window.generatePortraitForCharacter(characterId);
            }
          };
        }

        return;
      }

      // Build the confirmation view using standard modal structure
      const confirmationBodyHtml = `<p class="terminal-text">Delete this saved portrait version?${' '}This cannot be undone.</p>`;

      const confirmationFooterHtml = `<button class="terminal-btn"id="portrait-delete-cancel">NO</button><button class="terminal-btn terminal-btn-primary"id="portrait-delete-confirm">YES</button>`;

      // Transform modal to confirmation view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = 'Confirm Delete';
        modalBody.innerHTML = confirmationBodyHtml;
        if (modalFooter) modalFooter.innerHTML = confirmationFooterHtml;
      });

      // Handle cancel - restore original content
      const cancelBtn = document.getElementById('portrait-delete-cancel');
      const confirmBtn = document.getElementById('portrait-delete-confirm');

      const restoreOriginal = () => {
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = originalTitle;
          modalBody.innerHTML = originalBodyHtml;
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-populate ASCII previews after restoring
        if (Array.isArray(originalVersions) && originalVersions.length > 0) {
          this._populateAsciiPreviews(originalVersions);
        }

        this._initKeyboardFocus();
      };

      if (cancelBtn) {
        cancelBtn.onclick = restoreOriginal;
      }

      if (confirmBtn) {
        confirmBtn.onclick = async () => {
          // Prefer AppState cache to ensure we have the most up-to-date data
          let character = null;
          try {
            if (window.AppState && Array.isArray(AppState.characters)) {
              character = AppState.characters.find(
                (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
              ) || null;
            }
          } catch (e) {
            // Non-fatal – fall back to storage lookup below.
          }
          if (!character) {
            character = await CharacterStorage.getById(characterId);
          }
          if (!character) return;

          const metadata = character.portraitMetadata || {};
          const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
          if (!versions.length) {
            this.closeHistory();
            return;
          }

          const remaining = versions.filter((v) => v.id !== versionId);
          const deletedWasActive = metadata.activeVersionId === versionId;

          const updatedMetadata = {
            ...metadata,
            versions: remaining,
            activeVersionId: deletedWasActive
              ? remaining[0]?.id || null
              : metadata.activeVersionId,
          };

          const updates = {
            portraitMetadata: updatedMetadata,
          };

          if (deletedWasActive) {
            if (remaining[0]) {
              updates.originalPortraitUrl =
                remaining[0].url || character.originalPortraitUrl || null;
              updates.customPortraitAscii =
                remaining[0].ascii || character.customPortraitAscii || '';
              updates.portrait = {
                ...(character.portrait || {}),
                url:
                  remaining[0].url ||
                  (character.portrait && character.portrait.url) ||
                  null,
                ascii:
                  remaining[0].ascii ||
                  (character.portrait && character.portrait.ascii) ||
                  '',
              };
            } else {
              // No remaining custom versions – clear custom portrait so we fall back to pre-generated ASCII.
              updates.originalPortraitUrl = null;
              updates.customPortraitAscii = '';
              updates.portrait = {
                ...(character.portrait || {}),
                url: null,
                ascii: character.asciiPortrait || '',
              };
            }
          }

          await CharacterStorage.update(characterId, updates);
          if (window.AppState && typeof AppState.loadCharacters === 'function') {
            await AppState.loadCharacters();
          }
          if (window.UI && typeof UI.render === 'function') {
            UI.render();
          }
          if (typeof window.viewCharacter === 'function') {
            window.viewCharacter(characterId);
          }

          // If no remaining versions, close the modal entirely
          if (!remaining.length) {
            this.closeHistory();
            return;
          }

          // Rebuild and show the updated history view
          const updatedCharacter = await CharacterStorage.getById(characterId);
          if (!updatedCharacter) {
            this.closeHistory();
            return;
          }

          const normalized =
            window.PortraitHistory &&
            typeof PortraitHistory.normalizeForDisplay === 'function'
              ? PortraitHistory.normalizeForDisplay(updatedCharacter)
              : (() => {
                  const fallbackMetadata = updatedCharacter.portraitMetadata || {};
                  const fallbackRaw = Array.isArray(fallbackMetadata.versions)
                    ? fallbackMetadata.versions
                    : [];
                  return {
                    metadata: fallbackMetadata,
                    versions: fallbackRaw,
                    hasVersions: fallbackRaw.length > 0,
                    hasCustomPortraitWithoutHistory: !fallbackRaw.length,
                  };
                })();

          // Update state context with new versions
          state.context = {
            ...state.context,
            metadata: normalized.metadata,
            versions: normalized.versions,
            hasCustomPortraitWithoutHistory: normalized.hasCustomPortraitWithoutHistory,
          };

          const listHtml = this._buildHistoryCardsHtml(
            'manager',
            characterId,
            normalized.metadata,
            normalized.versions,
            normalized.hasCustomPortraitWithoutHistory,
          );

          // Build updated body content
          const updatedBodyHtml = `<p class="terminal-text-small terminal-text-dim">View previous custom AI portraits for this character.Choose one to make it active,or delete versions you no longer need.</p><div class="portrait-history-carousel">${normalized.versions.length>1?`<button
                      type="button"
                      class="portrait-history-nav portrait-history-nav-left"
                      aria-label="Previous portrait"
                      aria-controls="portraitHistoryList"
                      onclick="event.stopPropagation(); PortraitUI.moveFocus(-1);"
                    >
                      <span aria-hidden="true">‹</span>
                    </button>`:''}<div
id="portraitHistoryList"
class="portrait-history-card-row${normalized.versions.length===1?' is-single':''}">${listHtml}</div>${normalized.versions.length>1?`<button
                      type="button"
                      class="portrait-history-nav portrait-history-nav-right"
                      aria-label="Next portrait"
                      aria-controls="portraitHistoryList"
                      onclick="event.stopPropagation(); PortraitUI.moveFocus(1);"
                    >
                      <span aria-hidden="true">›</span>
                    </button>`:''}</div>`;

          // Transform back to history view with updated content
          this._animateModalContentResize('portraitHistoryModal', () => {
            if (modalTitle) modalTitle.textContent = originalTitle;
            modalBody.innerHTML = updatedBodyHtml;
            if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
          });

          // Re-populate ASCII previews and reset focus
          this._populateAsciiPreviews(normalized.versions);
          this._initKeyboardFocus();
        };
      }
    },

    // ========================================
    // INTERNAL HELPERS
    // ========================================

    _buildHistoryCardsHtml(
      context,
      characterId,
      metadata,
      versions,
      hasCustomPortraitWithoutHistory,
    ) {
      const hasVersions = versions.length > 0;

      if (!hasVersions) {
        if (hasCustomPortraitWithoutHistory) {
          return `<div class="terminal-text-small terminal-text-dim portrait-history-callout"><p><strong>No portrait history yet.</strong></p><p>This character's portrait was created before the history feature was added.</p><p>Generate a new custom AI portrait to:</p><ul class="portrait-history-callout-list"><li>• Save your current portrait as Version 1</li><li>• Add the new portrait as Version 2</li><li>• Enable portrait version switching</li></ul></div>`;
        }

        return `<p class="terminal-text-small terminal-text-dim portrait-history-callout">No saved portraits yet.<br><br>Generate a custom AI portrait to start building a history.</p>`;
      }

      // Check global portrait view mode (ASCII vs Original) to determine default display
      let portraitViewMode = 'ascii';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal: keep default
      }
      const showOriginalByDefault = portraitViewMode === 'original';

      return versions
        .map((v) => {
          const isActive = metadata.activeVersionId === v.id;
          const createdDate = v.createdAt ? new Date(v.createdAt) : null;
          const dateLabel = createdDate
            ? createdDate.toLocaleDateString()
            : '';
          const timeLabel = createdDate
            ? createdDate.toLocaleTimeString()
            : '';
          const title = dateLabel || 'Unknown date';
          const infoText = timeLabel || '';

          const hasImage = !!v.url;
          const hasPrompt = !!v.prompt;

          // Apply visibility based on global portrait view mode:
          // If 'original' mode and we have an image, show image by default (hide ASCII)
          // Otherwise show ASCII by default (hide image)
          const shouldShowOriginal = showOriginalByDefault && hasImage;
          const asciiHiddenClass = shouldShowOriginal ? ' is-hidden' : '';
          const imageHiddenClass = shouldShowOriginal ? '' : ' is-hidden';

          const thumbHtml = `<div class="card-thumbnail${shouldShowOriginal ? ' card-thumbnail--original-mode' : ''}"><div class="ascii-portrait portrait-history-preview${asciiHiddenClass}"data-version-id="${v.id}"></div>${hasImage?`<img src="${v.url}" alt="${title}" class="portrait-history-image${imageHiddenClass}" data-version-id="${v.id}" onload="this.classList.add('is-loaded')">`:''}</div>`;

          // Overflow menu for per-version actions (View, Prompt, Delete)
          const actionItems = [];

          // Toggle button label depends on current default view
          if (hasImage) {
            const toggleLabel = shouldShowOriginal ? 'View ASCII' : 'View original';
            actionItems.push(`<button
class="selector-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); PortraitUI.toggleView('${v.id}')"
data-toggle-version-id="${v.id}"><span class="selector-option-icon">◉</span><span class="selector-option-label">${toggleLabel}</span></button>`);
          }

          // Always show Image Info - displays date, style, model, and prompt (if available)
          actionItems.push(`<button
class="selector-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); PortraitUI.viewImageInfo('${characterId}', '${v.id}')"
title="View image generation details"><span class="selector-option-icon">ℹ︎</span><span class="selector-option-label">Image info</span></button>`);

          actionItems.push(`<button
class="selector-option portrait-history-delete-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); PortraitUI.deleteVersion('${characterId}', '${v.id}')"
title="Delete this portrait version"
aria-label="Delete portrait version"><span class="selector-option-icon">×</span><span class="selector-option-label">Delete version</span></button>`);

          const actionsMenu =
            actionItems.length > 0
              ? `<div class="portrait-history-actions selector-shell selector-shell--actions"><button
class="terminal-btn-small selector-trigger overflow-trigger portrait-history-overflow-btn"
type="button"
aria-haspopup="menu"
aria-expanded="false"
aria-label="More portrait actions"
onclick="CharacterSheet.toggleSelectorMenu(this); event.stopPropagation();"><span class="sheet-actions-icon"aria-hidden="true"><span class="sheet-actions-dot dot-1"></span><span class="sheet-actions-dot dot-2"></span><span class="sheet-actions-dot dot-3"></span></span></button><div class="selector-menu portrait-history-menu"role="menu"aria-hidden="true">${actionItems.join('')}</div></div>`
              : '';

          return `<div class="character-card portrait-history-card${isActive?' is-selected':''}" data-version-id="${v.id}" onclick="PortraitUI.selectCard('${v.id}')">${thumbHtml}<div class="card-details portrait-history-details"><div class="portrait-history-meta"><div class="card-name">${title}</div><div class="card-info">${infoText||'&nbsp;'}</div></div>${actionsMenu}</div></div>`;
        })
        .join('');
    },

    // Smoothly animate a modal's content height when its body is "reloaded"
    // (e.g., after deleting a portrait history entry or showing confirmation).
    // Uses a simple FLIP pattern: measure -> update -> animate height from old to new.
    _animateModalContentResize(modalId, updateFn) {
      const modal = document.getElementById(modalId);
      if (!modal || typeof updateFn !== 'function') {
        if (typeof updateFn === 'function') {
          updateFn();
        }
        return;
      }

      const content = modal.querySelector('.modal-content');
      if (!content) {
        updateFn();
        return;
      }

      const startHeight = content.offsetHeight;

      // Apply DOM updates synchronously so we can measure the new height.
      updateFn();

      const endHeight = content.offsetHeight;

      if (!startHeight || !endHeight || startHeight === endHeight) {
        return;
      }

      // Lock the current height, then animate to the new height.
      content.style.height = `${startHeight}px`;
      // Force reflow so the browser registers the starting height.
      // eslint-disable-next-line no-unused-expressions
      content.offsetHeight;

      content.style.transition =
        'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1.05)';
      content.style.height = `${endHeight}px`;

      const cleanup = () => {
        content.style.height = '';
        content.style.transition = '';
        content.removeEventListener('transitionend', cleanup);
      };

      content.addEventListener('transitionend', cleanup);
    },

    _populateAsciiPreviews(versions) {
      if (!Array.isArray(versions) || versions.length === 0) return;

      if (
        window.PortraitHistory &&
        typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
      ) {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
        return;
      }

      // Fallback: simple synchronous population if shared helper is unavailable.
      versions.forEach((v) => {
        if (!v) return;
        const el = document.querySelector(
          `.portrait-history-preview.ascii-portrait[data-version-id="${v.id}"]`,
        );
        if (el && v.ascii) {
          // Use <pre> wrapper for proper CSS flex centering
          el.innerHTML = '';
          const pre = document.createElement('pre');
          pre.textContent = this.cropAsciiForThumbnail(v.ascii);
          el.appendChild(pre);
        }

        const promptEl = document.querySelector(
          `.portrait-history-prompt[data-version-id="${v.id}"]`,
        );
        if (promptEl && v.prompt) {
          promptEl.textContent = v.prompt;
        }
      });
    },

    _getCards() {
      return Array.from(
        document.querySelectorAll('#portraitHistoryModal .character-card'),
      );
    },

    _updateNavButtons(currentIndex) {
      const cards = this._getCards();
      const total = cards.length;
      const prevBtn = document.querySelector(
        '#portraitHistoryModal .portrait-history-nav-left',
      );
      const nextBtn = document.querySelector(
        '#portraitHistoryModal .portrait-history-nav-right',
      );

      const hasMultiple = total > 1;

      if (prevBtn) {
        const disabled = !hasMultiple || currentIndex <= 0;
        prevBtn.disabled = disabled;
        prevBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }

      if (nextBtn) {
        const disabled = !hasMultiple || currentIndex >= total - 1;
        nextBtn.disabled = disabled;
        nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
    },

    _updateFocus() {
      const cards = this._getCards();
      if (!cards.length) return;

      const index =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;

      cards.forEach((card, i) => {
        const isFocused = i === index;
        card.classList.toggle('is-keyboard-focused', isFocused);
        card.classList.toggle('is-selected', isFocused);
      });

      // Ensure the focused card is scrolled into view within the horizontal
      // list so keyboard and button navigation always reveal the selection.
      const activeCard = cards[index];
      if (activeCard && typeof activeCard.scrollIntoView === 'function') {
        try {
          activeCard.scrollIntoView({
            block: 'nearest',
            inline: 'nearest', // keep the focused card fully visible but do not center it
            behavior: 'smooth',
          });
        } catch (e) {
          // Non-fatal; older browsers may not support options object
          activeCard.scrollIntoView();
        }
      }

      this._updateNavButtons(index);
    },

    _initKeyboardFocus() {
      const cards = this._getCards();
      if (!cards.length) return;

      // Prefer focusing the card that represents the current active portrait,
      // falling back to the first card if no active version is set.
      let initialIndex = 0;
      try {
        const ctx = state.context;
        const activeId = ctx && ctx.metadata && ctx.metadata.activeVersionId;
        if (activeId) {
          const matchIndex = cards.findIndex(
            (card) => card.getAttribute('data-version-id') === activeId,
          );
          if (matchIndex >= 0) {
            initialIndex = matchIndex;
          }
        }
      } catch (e) {
        // Non-fatal: just fall back to index 0
      }

      state.focusIndex = initialIndex;
      this._updateFocus();
    },

    _attachKeyboardHandlers() {
      state.escHandler = (e) => {
        if (e.key === 'Escape') this.closeHistory();
      };

      state.keyHandler = (e) => {
        const modal = document.getElementById('portraitHistoryModal');
        if (!modal) return;

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.moveFocus(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.moveFocus(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveFocus(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveFocus(1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmSelection();
        }
      };

      document.addEventListener('keydown', state.escHandler);
      document.addEventListener('keydown', state.keyHandler);
    },

    _detachKeyboardHandlers() {
      if (state.escHandler) {
        document.removeEventListener('keydown', state.escHandler);
        state.escHandler = null;
      }
      if (state.keyHandler) {
        document.removeEventListener('keydown', state.keyHandler);
        state.keyHandler = null;
      }
    },

    async _usePortraitVersionManager(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      // Prefer the in-memory AppState cache to avoid stale data from storage.
      // The AppState may contain recent edits that haven't been persisted yet,
      // and using storage directly could cause those edits to be lost.
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }

      // Fallback to storage if not found in AppState cache
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
      if (!character) return;

      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const version = versions.find((v) => v.id === versionId);

      if (!version) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Portrait version not found.');
        }
        return;
      }

       // Debug: log current vs target portrait details.
      try {
        console.log('%c🎨 MANAGER PORTRAIT APPLY VERSION', 'color:#0ff;font-weight:bold;');
        console.log('  Character ID:', characterId);
        console.log('  Applying version ID:', versionId);
        console.log('  Version has ascii:', !!version.ascii, 'len:', (version.ascii || '').length);
        console.log('  Version has url:', !!version.url, 'url:', version.url || '(none)');
        console.log(
          '  Current customPortraitAscii len:',
          (character.customPortraitAscii || '').length,
        );
        console.log(
          '  Current portrait.ascii len:',
          (character.portrait && character.portrait.ascii
            ? character.portrait.ascii.length
            : 0),
        );
      } catch (e) {
        // Non-fatal
      }

      // Immediately patch the visible manager UI so the user sees the new art
      // without needing to wait for storage reload timing or a full refresh.
      try {
        const portraitId = `character-portrait-${characterId}`;
        const originalPortraitId = `original-portrait-${characterId}`;
        const asciiEl = document.getElementById(portraitId);
        const imgEl = document.getElementById(originalPortraitId);
        const container = asciiEl
          ? asciiEl.closest('.portrait-container')
          : null;

        // Update ASCII art if we have a visible container and ASCII content.
        if (asciiEl && version.ascii) {
          if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
            CharacterSheet.setPortraitContent(asciiEl, version.ascii);
          } else {
            // Fallback: use <pre> wrapper for proper CSS flex centering
            asciiEl.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = version.ascii;
            asciiEl.appendChild(pre);
          }
        }

        // Update original image src so "View original art" immediately shows
        // the selected version's image (respecting global portrait view mode).
        if (imgEl && version.url) {
          imgEl.src = version.url;

          if (
            container &&
            window.StorageService &&
            StorageService.getPortraitViewMode
          ) {
            const mode = StorageService.getPortraitViewMode();
            if (mode === 'original') {
              imgEl.addEventListener(
                'load',
                () => {
                  if (asciiEl) {
                    asciiEl.classList.add('is-hidden');
                  }
                  imgEl.classList.remove('is-hidden');
                  container.classList.add('portrait-container--original-mode');
                },
                { once: true },
              );
            }
          }
        }

        // Also update the grid card thumbnail (if it exists) so the list view
        // immediately reflects the selected portrait version.
        // Respect the user's portrait view mode preference (original vs ASCII).
        const thumbEl = document.getElementById(`card-thumb-${characterId}`);
        if (thumbEl) {
          try {
            // Check the user's portrait view mode preference
            let portraitViewMode = 'original';
            try {
              if (window.StorageService && StorageService.getPortraitViewMode) {
                portraitViewMode = StorageService.getPortraitViewMode();
              } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
              }
            } catch (e) {
              // Non-fatal: keep default
            }

            const showOriginalImage = portraitViewMode === 'original' && !!version.url;

            if (showOriginalImage) {
              // Update to show the original image
              // Check if thumbnail already has an img element
              let imgEl = thumbEl.querySelector('img');
              if (imgEl) {
                // Just update the src
                imgEl.src = version.url;
              } else {
                // Need to switch from ASCII to image mode
                thumbEl.innerHTML = '';
                thumbEl.classList.add('card-thumbnail--image');
                imgEl = document.createElement('img');
                imgEl.src = version.url;
                imgEl.alt = 'Character portrait';
                imgEl.loading = 'lazy';
                imgEl.onload = function() { this.classList.add('is-loaded'); };
                thumbEl.appendChild(imgEl);
              }
            } else if (version.ascii) {
              // Update to show ASCII art
              let croppedArt;
              if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                croppedArt = UI.cropAsciiForThumbnail(version.ascii);
              } else {
                // Fallback: simple top-crop similar to CharacterSheet behavior
                const lines = version.ascii.split('\n');
                const topLines = lines.slice(0, 80).map((line) => line.slice(0, 160));
                croppedArt = topLines.join('\n');
              }
              // Remove image mode class if present
              thumbEl.classList.remove('card-thumbnail--image');
              // Use <pre> wrapper for proper CSS flex centering
              thumbEl.innerHTML = '';
              const pre = document.createElement('pre');
              pre.textContent = croppedArt;
              thumbEl.appendChild(pre);
            }
          } catch (thumbError) {
            console.error(
              'PortraitUI._usePortraitVersionManager: thumbnail update failed',
              thumbError,
            );
          }
        }
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: direct DOM patch failed',
          e,
        );
      }

      const updatedMetadata = {
        ...metadata,
        activeVersionId: version.id,
      };

      const updates = {
        originalPortraitUrl:
          version.url || character.originalPortraitUrl || null,
        customPortraitAscii:
          version.ascii || character.customPortraitAscii || '',
        portraitMetadata: updatedMetadata,
        portrait: {
          ...(character.portrait || {}),
          url:
            version.url ||
            (character.portrait && character.portrait.url) ||
            null,
          ascii:
            version.ascii ||
            (character.portrait && character.portrait.ascii) ||
            '',
        },
      };

      // Persist the change to storage using the shared CharacterStorage
      // facade. This will update either cloud or local data depending on
      // the current auth state. We deliberately do NOT immediately re-render
      // from storage results here to avoid snapping the UI back to any stale
      // data that a just-in-time refetch might return.
      try {
        await CharacterStorage.update(characterId, updates);
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: storage update failed',
          e,
        );
      }

      // Keep AppState in sync for future renders/navigation so that whenever
      // the grid or sheet *does* re-render from state, it uses this new
      // portrait version. We rely on our direct DOM patch above to keep the
      // currently visible sheet/card in sync right away.
      // Use String() comparison to handle type mismatches (cloud IDs may be
      // numeric, but characterId from onclick is always a string).
      try {
        const nextCharacter = { ...character, ...updates };
        const idStr = String(characterId);

        if (window.AppState) {
          if (Array.isArray(AppState.characters)) {
            const idx = AppState.characters.findIndex(
              (c) => c && String(c.id) === idStr,
            );
            if (idx !== -1) {
              AppState.characters[idx] = nextCharacter;
            }
          }
          if (Array.isArray(AppState.filteredCharacters)) {
            const fIdx = AppState.filteredCharacters.findIndex(
              (c) => c && String(c.id) === idStr,
            );
            if (fIdx !== -1) {
              AppState.filteredCharacters[fIdx] = nextCharacter;
            }
          }
        }
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: AppState sync failed',
          e,
        );
      }
      this.closeHistory();
    },
  });

  // Backwards-compatible global hook used by shared-character-sheet.js
  // and any debug tooling that calls openPortraitHistory(characterId).
  if (typeof window.openPortraitHistory !== 'function') {
    window.openPortraitHistory = function (characterId) {
      return PortraitUI.openManagerHistory(characterId);
    };
  }
})();





// ===== BUNDLE PART: character-manager.js =====

// ========================================
// KEYBOARD NAVIGATION
// ========================================
// HTML escaping is provided by Utils.escapeHtml from character-builder-utils.js
const KeyboardNav = {
    currentFocusIndex: 0,
    isActive: true,
    mode: 'cards', // 'cards' or 'form'

    /**
     * Dynamically calculate the number of columns in the grid
     * by measuring actual card positions.
     */
    getGridColumns() {
        const cards = this.getCharacterCards();
        if (cards.length < 2) return 1;
        
        // Compare the top position of the first two cards
        // If they're the same, they're in the same row
        const firstTop = cards[0].getBoundingClientRect().top;
        let columnsInFirstRow = 1;
        
        for (let i = 1; i < cards.length; i++) {
            const cardTop = cards[i].getBoundingClientRect().top;
            // Allow small tolerance for rounding errors
            if (Math.abs(cardTop - firstTop) < 5) {
                columnsInFirstRow++;
            } else {
                break;
            }
        }
        
        return columnsInFirstRow;
    },

    getCharacterCards() {
        return Array.from(document.querySelectorAll('.character-card'));
    },

    getFocusableElements() {
        // Return all focusable elements in the left panel
        return Array.from(document.querySelectorAll(
            '#searchInput, #sortBy, .character-card, #importBtn, #newCharacterBtn'
        ));
    },

    getCurrentlyFocusedElement() {
        return document.activeElement;
    },

    isInFormElement() {
        const activeEl = this.getCurrentlyFocusedElement();
        return activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.tagName === 'BUTTON'
        );
    },

    /**
     * Update visual keyboard focus on the grid.
     * @param {boolean} skipSheetUpdate - when true, do NOT update the character sheet.
     *                                    Used when focus is being synced from a sheet change
     *                                    (e.g. mouse click) to avoid recursion.
     */
    updateFocus(skipSheetUpdate = false) {
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Remove focus from all cards (immediate change)
        cards.forEach((card) => {
            card.classList.remove('is-keyboard-focused');
        });

        // Add focus to current index
        if (cards[this.currentFocusIndex]) {
            const focusedCard = cards[this.currentFocusIndex];
            focusedCard.classList.add('is-keyboard-focused');

            // When keyboard focus moves, treat that as "viewing" the character.
            // This keeps the right-hand character sheet in sync with the focused card.
            if (!skipSheetUpdate) {
                const id = focusedCard.getAttribute('data-id');
                if (id) {
                    // Avoid re-triggering keyboard focus sync inside viewCharacter
                    viewCharacter(id, { fromKeyboard: true, skipKeyboardSync: true });
                }
            }

            // Scroll into view
            focusedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
            });
        }
    },

    moveUp() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move up by the actual number of grid columns
        const columns = this.getGridColumns();
        this.currentFocusIndex = Math.max(0, this.currentFocusIndex - columns);
        this.updateFocus();
    },

    moveDown() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move down by the actual number of grid columns
        const columns = this.getGridColumns();
        this.currentFocusIndex = Math.min(cards.length - 1, this.currentFocusIndex + columns);
        this.updateFocus();
    },

    moveLeft() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move left, don't wrap
        this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 1);
        this.updateFocus();
    },

    moveRight() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move right, don't wrap
        this.currentFocusIndex = Math.min(cards.length - 1, this.currentFocusIndex + 1);
        this.updateFocus();
    },

    select() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        const card = cards[this.currentFocusIndex];
        if (card) {
            card.click();
        }
    },

    focusSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    },

    focusFirstCard() {
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;
        
        this.currentFocusIndex = 0;
        this.updateFocus();
        
        // Remove browser focus from form elements
        const activeEl = document.activeElement;
        if (activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT'
        )) {
            activeEl.blur();
        }
    },

    reset() {
        // Reset keyboard focus index without forcing an immediate sheet
        // update. This avoids surprising jumps in the right-hand character
        // sheet when the grid is re-rendered (e.g. after sorting or search).
        this.currentFocusIndex = 0;
        this.updateFocus(true);
    },

    clearAll() {
        // Clear keyboard focus from all cards (used when mouse takes over)
        const cards = this.getCharacterCards();
        cards.forEach(card => card.classList.remove('is-keyboard-focused'));
    }
};

// ========================================
// MODAL MANAGER (Universal modal behaviors)
// ========================================
const ModalManager = {
    // Track original form values for dirty checking
    _formSnapshots: new Map(),
    
    // Modals that have forms which can be dirty
    FORM_MODALS: ['editDetailsModal', 'portraitPromptModal'],
    
    /**
     * Initialize modal behaviors (call once on page load)
     */
    init() {
        // Backdrop click to close
        document.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal.show');
            if (!modal) return;
            
            // Only close if clicking the backdrop (the .modal itself, not .modal-content)
            if (e.target === modal) {
                this.requestClose(modal.id);
            }
        });
    },
    
    /**
     * Snapshot form values when a modal opens (for dirty checking)
     */
    snapshotForm(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        const inputs = modal.querySelectorAll('input, textarea, select');
        const snapshot = {};
        inputs.forEach(input => {
            if (input.id) {
                snapshot[input.id] = input.value;
            }
        });
        this._formSnapshots.set(modalId, snapshot);
    },
    
    /**
     * Check if a modal's form has unsaved changes
     */
    isDirty(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return false;
        
        const snapshot = this._formSnapshots.get(modalId);
        if (!snapshot) return false;
        
        const inputs = modal.querySelectorAll('input, textarea, select');
        for (const input of inputs) {
            if (input.id && snapshot[input.id] !== undefined) {
                if (input.value !== snapshot[input.id]) {
                    return true;
                }
            }
        }
        return false;
    },
    
    /**
     * Clear form snapshot
     */
    clearSnapshot(modalId) {
        this._formSnapshots.delete(modalId);
    },
    
    /**
     * Request to close a modal - shows confirmation if dirty
     */
    requestClose(modalId) {
        // Check if this is a form modal that might have unsaved changes
        if (this.FORM_MODALS.includes(modalId) && this.isDirty(modalId)) {
            this.showDiscardConfirmation(modalId);
            return;
        }
        
        // Not dirty or not a form modal - close immediately
        this.closeModal(modalId);
    },
    
    /**
     * Show discard confirmation dialog
     */
    showDiscardConfirmation(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Create confirmation overlay inside the modal
        let overlay = modal.querySelector('.modal-discard-confirm');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'modal-discard-confirm';
            overlay.innerHTML = `<div class="modal-discard-content"><p class="terminal-text">You have unsaved changes.</p><p class="terminal-text-small terminal-text-dim">Discard changes and close?</p><div class="modal-discard-actions"><button class="terminal-btn modal-discard-cancel">Keep editing</button><button class="terminal-btn modal-discard-confirm-btn">Discard</button></div></div>`;
            modal.querySelector('.modal-content').appendChild(overlay);
        }
        
        overlay.classList.add('show');
        
        // Focus the cancel button
        const cancelBtn = overlay.querySelector('.modal-discard-cancel');
        if (cancelBtn) cancelBtn.focus();
        
        // Handle button clicks
        const handleCancel = () => {
            overlay.classList.remove('show');
            cleanup();
        };
        
        const handleDiscard = () => {
            overlay.classList.remove('show');
            cleanup();
            this.closeModal(modalId, true); // force close
        };
        
        const cleanup = () => {
            cancelBtn?.removeEventListener('click', handleCancel);
            overlay.querySelector('.modal-discard-confirm-btn')?.removeEventListener('click', handleDiscard);
        };
        
        cancelBtn?.addEventListener('click', handleCancel);
        overlay.querySelector('.modal-discard-confirm-btn')?.addEventListener('click', handleDiscard);
    },
    
    /**
     * Actually close the modal (bypasses dirty check)
     */
    closeModal(modalId, force = false) {
        this.clearSnapshot(modalId);
        
        // Call the appropriate close function
        switch (modalId) {
            case 'importModal':
                closeImportModal();
                break;
            case 'duplicateModal':
                closeDuplicateModal();
                break;
            case 'editDetailsModal':
                closeEditDetailsModal();
                break;
            case 'authModal':
                cancelAuthFlow();
                break;
            case 'migrationModal':
                closeMigrationModal();
                break;
            case 'passwordResetModal':
                closePasswordResetModal();
                break;
            case 'portraitPromptModal':
                closePortraitPromptModal();
                break;
            case 'managerSettingsModal':
                closeManagerSettings();
                break;
            default:
                // Generic close for unknown modals
                const modal = document.getElementById(modalId);
                if (modal) {
                    animateModalClose(modal, { removeOnClose: false });
                }
        }
    }
};

// ========================================
// HYBRID STORAGE SERVICE (Cloud + Local)
// ========================================
// Shared implementation now lives in character-storage.js and exposes
// `window.CharacterStorage`. This file aliases it for local use.
const DEBUG_MANAGER = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);
const CharacterStorage = window.CharacterStorage;

// Utility: normalize card subtitle text (race + class) to sentence case
function toSentenceCase(text) {
    if (!text) return '';
    const lower = String(text).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// ========================================
// APP STATE
// ========================================
const AppState = {
    characters: [],
    filteredCharacters: [],
    searchTerm: '',
    sortMode: 'dateModified', // 'alphabetical' | 'dateModified'
    // The character id that should be considered "selected" across the UI.
    // This is the single source of truth used to keep the left-hand card
    // highlight, keyboard focus, and right-hand sheet in sync.
    selectedCharacterId: null,
    loading: false,

    async init() {
        await this.loadCharacters();
    },

    async loadCharacters() {
        try {
            this.loading = true;
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(true);
            }
            this.characters = await CharacterStorage.getAll();
            if (DEBUG_MANAGER) {
                console.log('📚 LOAD: Loaded', this.characters.length, 'characters from storage');
                console.log('📚 LOAD: Full character list with IDs:');
                this.characters.forEach((c, i) => {
                    console.log(`${i+1}.${c.name}(ID:${c.id})`);
                });
            }
            
            // Check for characters with missing/empty names
            const charsWithMissingNames = this.characters.filter(c => !c.name || !c.name.trim());
            if (charsWithMissingNames.length > 0) {
                console.warn('⚠️ CHARACTERS WITH MISSING NAMES:', charsWithMissingNames.length);
                console.warn('  IDs:', charsWithMissingNames.map(c => c.id));
                console.warn('  These may be incomplete characters from failed creation attempts.');
            }
            
            // Check for actual duplicate names (excluding empty names)
            const validNames = this.characters.filter(c => c.name && c.name.trim()).map(c => c.name);
            const duplicates = validNames.filter((name, index) => validNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
                console.warn('⚠️ DUPLICATE NAMES DETECTED:', [...new Set(duplicates)]);
                [...new Set(duplicates)].forEach(dupName => {
                    const matches = this.characters.filter(c => c.name === dupName);
                    console.warn(`"${dupName}"appears ${matches.length}times with IDs:`, matches.map(m => m.id));
                });
            }
            this.applyFilters();
            this.loading = false;
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(false);
            }
            UI.render(); // Re-render after characters load
        } catch (error) {
            console.error('Failed to load characters:', error);
            this.loading = false;
            showNotification('❌ Failed to load characters');
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(false);
            }
            UI.render(); // Render empty state on error
        }
    },

    applyFilters() {
        let filtered = [...this.characters];

        // Search filter
        if (this.searchTerm) {
            const search = this.searchTerm.toLowerCase();
            filtered = filtered.filter(char => 
                char.name?.toLowerCase().includes(search) ||
                char.class?.toLowerCase().includes(search) ||
                char.race?.toLowerCase().includes(search)
            );
        }

        // Helper: compute effective "date modified" timestamp for sorting.
        const getSortTime = (char) => {
            if (!char) return 0;
            const metadataExportDate =
                char.metadata && (char.metadata.exportDate || char.metadata.exportedAt);
            const raw =
                char.updatedAt ||
                char.createdAt ||
                metadataExportDate ||
                0;
            const t = new Date(raw).getTime();
            return Number.isFinite(t) ? t : 0;
        };

        // Sort according to current mode
        if (this.sortMode === 'alphabetical') {
            filtered.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                if (nameA === nameB) {
                    return (a.id || '').toString().localeCompare((b.id || '').toString());
                }
                return nameA.localeCompare(nameB);
            });
        } else if (this.sortMode === 'dateModified') {
            // Sort by most recently modified using canonical timestamps
            filtered.sort((a, b) => {
                const aTime = getSortTime(a);
                const bTime = getSortTime(b);
                if (aTime === bTime) {
                    return (a.name || '').localeCompare(b.name || '');
                }
                return bTime - aTime; // newest first
            });
        }

        this.filteredCharacters = filtered;
    }
};

// Tracks the most recent in-flight viewCharacter call so that slower, stale
// requests (for previously selected characters) can't overwrite the sheet for
// the most recently clicked or focused card.
let latestViewCharacterRequestId = 0;

// ========================================
// MOBILE VIEW HANDLING
// ========================================
const MOBILE_BREAKPOINT = 768;

const MobileView = {
    /** Check if we're currently at mobile viewport width */
    isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    },

    /** Track the previous viewport state to detect transitions */
    _wasMobile: null,
    
    /** Swipe tracking state */
    _touchStartX: 0,
    _touchStartY: 0,
    _touchCurrentX: 0,
    _touchCurrentY: 0,
    _isSwiping: false,
    _swipeDirection: null, // 'horizontal', 'vertical', or null (undetermined)
    _pointerId: null,
    _minSwipeDistance: 50,      // Min distance to trigger navigation
    _directionLockThreshold: 10, // Threshold to determine swipe direction intent

    /** Initialize resize listener for viewport transitions */
    init() {
        this._wasMobile = this.isMobile();
        window.addEventListener('resize', () => this.handleResize());
        this.initSwipeHandlers();
        this.initScrollHandler();
    },
    
    /** Track scroll state for header collapse */
    _lastScrollTop: 0,
    _scrollThreshold: 20,
    
    /** Initialize scroll handler for mobile header collapse */
    initScrollHandler() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        const header = document.querySelector('.terminal-header');
        if (!header) return;
        
        // Clear any stale scrolled state on init
        if (!this.isMobile()) {
            header.classList.remove('is-scrolled');
        }
        
        // Handle resize: clear scrolled state when switching to desktop
        window.addEventListener('resize', () => {
            if (!this.isMobile()) {
                header.classList.remove('is-scrolled');
            }
        });
        
        leftPanel.addEventListener('scroll', () => {
            if (!this.isMobile()) return;
            
            const scrollTop = leftPanel.scrollTop;
            
            // Add/remove scrolled class based on scroll position
            // CSS handles the max-height transition
            if (scrollTop > this._scrollThreshold) {
                header.classList.add('is-scrolled');
            } else {
                header.classList.remove('is-scrolled');
            }
            
            this._lastScrollTop = scrollTop;
        }, { passive: true });
    },
    
    /** Initialize swipe gesture handlers for mobile navigation */
    initSwipeHandlers() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        // Use pointer events for better compatibility with Chrome DevTools simulator
        // pointerdown - start tracking
        leftPanel.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' || e.pointerType === 'pen' || this.isMobile()) {
                this._touchStartX = e.clientX;
                this._touchStartY = e.clientY;
                this._touchCurrentX = e.clientX;
                this._touchCurrentY = e.clientY;
                this._isSwiping = true;
                this._swipeDirection = null; // Reset direction lock
                this._pointerId = e.pointerId;
            }
        }, { passive: true });
        
        // pointermove - track movement and determine direction intent
        leftPanel.addEventListener('pointermove', (e) => {
            if (!this._isSwiping) return;
            if (!this.isOpen()) return; // Only handle when viewing a sheet
            
            this._touchCurrentX = e.clientX;
            this._touchCurrentY = e.clientY;
            
            const deltaX = this._touchCurrentX - this._touchStartX;
            const deltaY = this._touchCurrentY - this._touchStartY;
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            
            // Determine direction if not yet locked and movement exceeds threshold
            if (this._swipeDirection === null && (absX > this._directionLockThreshold || absY > this._directionLockThreshold)) {
                // Use a ratio to determine intent: horizontal if X movement is at least 1.5x Y movement
                if (absX > absY * 1.5) {
                    this._swipeDirection = 'horizontal';
                    // Add class to indicate horizontal swipe in progress (prevents scroll)
                    leftPanel.classList.add('is-swiping-horizontal');
                } else if (absY > absX * 1.5) {
                    this._swipeDirection = 'vertical';
                }
                // If neither is dominant yet, wait for more movement
            }
            
            // If locked to horizontal, prevent default to stop vertical scrolling
            if (this._swipeDirection === 'horizontal') {
                e.preventDefault();
            }
        }, { passive: false }); // passive: false so we can preventDefault
        
        // pointerup - complete the gesture
        leftPanel.addEventListener('pointerup', (e) => {
            if (this._isSwiping) {
                this._touchCurrentX = e.clientX;
                this._touchCurrentY = e.clientY;
                this._isSwiping = false;
                leftPanel.classList.remove('is-swiping-horizontal');
                this._pointerId = null;
                this.handleSwipe();
            }
        }, { passive: true });
        
        // pointercancel - abort the gesture
        leftPanel.addEventListener('pointercancel', () => {
            this._isSwiping = false;
            this._swipeDirection = null;
            leftPanel.classList.remove('is-swiping-horizontal');
        }, { passive: true });
        
        // Also handle pointerleave to clean up if finger leaves the element
        leftPanel.addEventListener('pointerleave', (e) => {
            // Only cancel if we haven't locked direction yet
            if (this._isSwiping && this._swipeDirection === null) {
                this._isSwiping = false;
                leftPanel.classList.remove('is-swiping-horizontal');
            }
        }, { passive: true });
    },
    
    /** Handle swipe gesture detection */
    handleSwipe() {
        // Only handle swipes when viewing a character sheet on mobile
        if (!this.isOpen()) return;
        
        // Only process if we determined this was a horizontal swipe
        if (this._swipeDirection !== 'horizontal') {
            this._swipeDirection = null;
            return;
        }
        
        const deltaX = this._touchCurrentX - this._touchStartX;
        
        // Reset direction for next gesture
        this._swipeDirection = null;
        
        // Check if swipe distance meets minimum threshold
        if (Math.abs(deltaX) < this._minSwipeDistance) return;
        
        if (deltaX > 0) {
            // Swipe right → go to previous character
            this.navigateToPreviousCharacter();
        } else {
            // Swipe left → go to next character
            this.navigateToNextCharacter();
        }
    },
    
    /** Navigate to the next character in the grid (carousel) */
    navigateToNextCharacter() {
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) return;
        
        const currentId = AppState.selectedCharacterId;
        const currentIndex = characters.findIndex(c => c.id === currentId);
        
        // Carousel: wrap to first if at end
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % characters.length;
        const nextCharacter = characters[nextIndex];
        
        if (nextCharacter) {
            this.showSwipeLoader();
            viewCharacter(nextCharacter.id, { skipKeyboardSync: false, updateUrl: true });
        }
    },
    
    /** Navigate to the previous character in the grid (carousel) */
    navigateToPreviousCharacter() {
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) return;
        
        const currentId = AppState.selectedCharacterId;
        const currentIndex = characters.findIndex(c => c.id === currentId);
        
        // Carousel: wrap to last if at beginning
        const prevIndex = currentIndex <= 0 ? characters.length - 1 : currentIndex - 1;
        const prevCharacter = characters[prevIndex];
        
        if (prevCharacter) {
            this.showSwipeLoader();
            viewCharacter(prevCharacter.id, { skipKeyboardSync: false, updateUrl: true });
        }
    },
    
    /** Flag to track if we're in a swipe loading transition */
    _isSwipeLoading: false,
    
    /** Show the swipe loading overlay */
    showSwipeLoader() {
        this._isSwipeLoading = true;
    },
    
    /** Hide the swipe loading overlay */
    hideSwipeLoader() {
        this._isSwipeLoading = false;
        const loader = document.querySelector('.mobile-swipe-loader');
        if (loader) {
            loader.remove();
        }
    },

    /** Handle viewport resize transitions */
    handleResize() {
        const isMobileNow = this.isMobile();
        
        // No change in viewport category
        if (isMobileNow === this._wasMobile) return;
        
        const wasDesktop = this._wasMobile === false;
        const isNowMobile = isMobileNow === true;
        const wasModalOpen = this.isOpen();
        
        this._wasMobile = isMobileNow;
        
        if (wasDesktop && isNowMobile) {
            // Desktop → Mobile: preserve selected character and open mobile sheet
            const selectedId = AppState?.selectedCharacterId;
            if (selectedId) {
                // Use double requestAnimationFrame to ensure DOM/CSS is fully settled after resize
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Verify selection is still valid
                        if (AppState.selectedCharacterId === selectedId) {
                            // Re-trigger viewCharacter which handles mobile opening properly
                            viewCharacter(selectedId, { skipKeyboardSync: true, updateUrl: false });
                        }
                    });
                });
            }
            // If no character was selected on desktop, do nothing - user can tap to view
        } else if (!isMobileNow) {
            // Mobile → Desktop: close modal view but preserve selected character
            const selectedId = AppState?.selectedCharacterId;
            
            if (wasModalOpen) {
                // Close the modal view without clearing selection (don't use this.close())
                const leftPanel = document.getElementById('character-list-panel');
                if (leftPanel) {
                    leftPanel.classList.remove('is-viewing-sheet');
                }
            }
            // Clear scroll state on header when going to desktop
            const header = document.querySelector('.terminal-header');
            if (header) header.classList.remove('is-scrolled');
            
            // If nothing is selected, auto-select the first character
            // Otherwise keep the current selection from mobile
            if (!selectedId && AppState.filteredCharacters.length > 0) {
                const firstChar = AppState.filteredCharacters[0];
                viewCharacter(firstChar.id, { skipKeyboardSync: false, updateUrl: true });
            }
        }
    },

    /** Check if mobile sheet view is open */
    isOpen() {
        const leftPanel = document.getElementById('character-list-panel');
        return leftPanel && leftPanel.classList.contains('is-viewing-sheet');
    },

    /** Open the mobile sheet view for a character (swaps grid for sheet) */
    open(characterId) {
        const leftPanel = document.getElementById('character-list-panel');
        const container = document.getElementById('mobileSheetContainer');
        
        if (!leftPanel || !container) return;
        
        // Check if we're in a swipe transition (loader was shown)
        const isSwipeTransition = this._isSwipeLoading;
        
        // Clone the character sheet content into the container
        const sourceSheet = document.getElementById('characterSheet');
        if (sourceSheet) {
            container.innerHTML = sourceSheet.innerHTML;
        }
        
        // If this was a swipe transition, re-add the loader overlay
        if (isSwipeTransition) {
            this.addSwipeLoaderToContainer(container);
        }
        
        // Swap to sheet view
        leftPanel.classList.add('is-viewing-sheet');
        
        // Update character count display
        this.updateCharacterCount(characterId);
        
        // Scroll to top
        leftPanel.scrollTop = 0;
        
        // Wait for portrait image to load before hiding the loader
        if (isSwipeTransition) {
            this.waitForPortraitLoad(container);
        }
    },
    
    /** Update the character count display in the mobile back bar */
    updateCharacterCount(characterId) {
        const countEl = document.getElementById('mobileCharacterCount');
        if (!countEl) return;
        
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) {
            countEl.textContent = '';
            return;
        }
        
        const currentIndex = characters.findIndex(c => c.id === characterId);
        const currentNum = currentIndex >= 0 ? currentIndex + 1 : 1;
        const total = characters.length;
        
        countEl.textContent = currentNum + ' of ' + total;
    },
    
    /** Add the swipe loader overlay to the portrait container */
    addSwipeLoaderToContainer(container) {
        // Find the portrait container within the sheet
        const portraitContainer = container.querySelector('.portrait-container');
        if (!portraitContainer) return;
        
        const loader = document.createElement('div');
        loader.className = 'mobile-swipe-loader is-visible';
        loader.innerHTML = `<div class="panel-loading-cube-container"><div class="panel-loading-cube"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`;
        portraitContainer.appendChild(loader);
    },
    
    /** Wait for portrait image to load, then hide the swipe loader */
    waitForPortraitLoad(container) {
        // Minimum time to show loader for visual feedback (prevents flicker)
        const MIN_LOADER_DURATION = 150;
        const loaderStartTime = Date.now();
        
        const hideWithMinDuration = () => {
            const elapsed = Date.now() - loaderStartTime;
            const remaining = MIN_LOADER_DURATION - elapsed;
            if (remaining > 0) {
                setTimeout(() => this.hideSwipeLoader(), remaining);
            } else {
                this.hideSwipeLoader();
            }
        };
        
        // Find all portrait images in the container (original and/or ascii)
        const images = container.querySelectorAll('img.original-portrait, .ascii-portrait img');
        
        if (images.length === 0) {
            // No images found - hide after minimum duration
            hideWithMinDuration();
            return;
        }
        
        // Track how many images need to load
        let pendingCount = 0;
        let loadedOrErrored = 0;
        
        const checkComplete = () => {
            loadedOrErrored++;
            if (loadedOrErrored >= pendingCount) {
                hideWithMinDuration();
            }
        };
        
        images.forEach(img => {
            if (!img.complete) {
                pendingCount++;
                img.addEventListener('load', checkComplete, { once: true });
                img.addEventListener('error', checkComplete, { once: true });
            }
        });
        
        if (pendingCount === 0) {
            // All images already loaded (cached) - hide after minimum duration
            hideWithMinDuration();
        } else {
            // Fallback timeout in case something goes wrong (5 seconds)
            setTimeout(() => {
                this.hideSwipeLoader();
            }, 5000);
        }
    },

    /** Close the mobile sheet view (returns to grid) */
    close() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        leftPanel.classList.remove('is-viewing-sheet');
        
        // Clear selection state on mobile when going back
        if (typeof AppState !== 'undefined' && AppState) {
            AppState.selectedCharacterId = null;
        }
        
        // Remove is-selected from all cards
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('is-selected');
        });
        
        // Clear URL param
        clearCharacterFromUrl();
    }
};

/** Global function to close mobile sheet (called from HTML onclick) */
function closeMobileSheet() {
    MobileView.close();
}

// ========================================
// UI RENDERING
// ========================================
const UI = {
    setLoadingState(isLoading) {
        const leftLoading = document.getElementById('leftPanelLoading');
        const rightLoading = document.getElementById('rightPanelLoading');
        const grid = document.getElementById('characterGrid');
        const emptyState = document.getElementById('emptyState');
        const sheetPlaceholder = document.querySelector('.sheet-placeholder');
        const characterSheet = document.getElementById('characterSheet');

        if (isLoading) {
            if (leftLoading) leftLoading.classList.remove('is-hidden');
            if (rightLoading) rightLoading.classList.remove('is-hidden');
            if (grid) grid.classList.add('is-hidden');
            if (emptyState) emptyState.classList.add('is-hidden');
            if (sheetPlaceholder) sheetPlaceholder.classList.add('is-hidden');
            if (characterSheet) characterSheet.classList.add('is-hidden');
        } else {
            if (leftLoading) leftLoading.classList.add('is-hidden');
            if (rightLoading) rightLoading.classList.add('is-hidden');
            if (grid) grid.classList.remove('is-hidden');
            // empty state and sheet visibility will be controlled by UI.render()
        }
    },

    // Flag to track if we've handled the initial URL character selection
    _initialUrlCharacterHandled: false,

    render() {
        const previousSelectedId =
            typeof AppState !== 'undefined' && AppState
                ? AppState.selectedCharacterId
                : null;

        this.renderCharacterGrid();
        this.updateCount();

        const characters =
            typeof AppState !== 'undefined' &&
            AppState &&
            Array.isArray(AppState.filteredCharacters)
                ? AppState.filteredCharacters
                : [];
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetEl = document.getElementById('characterSheet');

        if (!characters.length) {
            if (placeholder) placeholder.classList.remove('is-hidden');
            if (sheetEl) sheetEl.classList.add('is-hidden');
            if (typeof AppState !== 'undefined' && AppState) {
                AppState.selectedCharacterId = null;
            }
            clearCharacterFromUrl();
            return;
        }

        // Check URL for character selection (only on first render with characters)
        let urlCharacterId = null;
        if (!this._initialUrlCharacterHandled) {
            urlCharacterId = getCharacterIdFromUrl();
            this._initialUrlCharacterHandled = true;
        }

        const isMobile = typeof MobileView !== 'undefined' && MobileView.isMobile();

        // Ensure we have a valid selected id within the current filtered list.
        // Priority: URL param > previous selection > first character (desktop only)
        let targetId = urlCharacterId || previousSelectedId || null;
        const hasValidSelection =
            targetId &&
            characters.some((c) => String(c.id) === String(targetId));

        if (!hasValidSelection) {
            // On mobile, don't auto-select the first character (user must tap)
            // On desktop, always have something selected
            targetId = isMobile ? null : (characters[0] && characters[0].id);
        }

        if (typeof AppState !== 'undefined' && AppState) {
            AppState.selectedCharacterId = targetId || null;
        }

        // Sync the card highlight and keyboard focus with the selected id.
        const grid = document.getElementById('characterGrid');
        if (grid) {
            const cards = Array.from(grid.querySelectorAll('.character-card'));
            cards.forEach((card) => card.classList.remove('is-selected'));

            if (targetId) {
                const selectedCard = grid.querySelector(`[data-id="${targetId}"]`);
                if (selectedCard) {
                    selectedCard.classList.add('is-selected');

                    if (
                        typeof KeyboardNav !== 'undefined' &&
                        KeyboardNav &&
                        typeof KeyboardNav.getCharacterCards === 'function'
                    ) {
                        const allCards = KeyboardNav.getCharacterCards();
                        const cardIndex = allCards.indexOf(selectedCard);
                        if (cardIndex !== -1) {
                            KeyboardNav.currentFocusIndex = cardIndex;
                            // Keep keyboard focus visuals in sync without
                            // re-triggering a sheet update.
                            KeyboardNav.updateFocus(true);
                        }
                    }
                }
            }
        }

        // Handle sheet rendering based on viewport
        if (targetId && (targetId !== previousSelectedId || urlCharacterId)) {
            if (isMobile) {
                // On mobile with URL character, render sheet then open modal
                // Use openMobileModal: false here since we handle modal opening manually
                viewCharacter(targetId, { skipKeyboardSync: true, updateUrl: false, openMobileModal: false });
                if (urlCharacterId) {
                    // Use double requestAnimationFrame to ensure DOM has painted
                    // before cloning. This is more reliable than a fixed timeout.
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            // Verify this is still the selected character
                            if (AppState.selectedCharacterId === targetId) {
                                MobileView.open(targetId);
                            }
                        });
                    });
                }
            } else {
                // Desktop: render sheet in right panel as usual
                viewCharacter(targetId, { skipKeyboardSync: true, updateUrl: !urlCharacterId, openMobileModal: false });
            }
        } else if (!targetId && !isMobile) {
            // Desktop with no selection and no characters - show placeholder
            if (placeholder) placeholder.classList.remove('is-hidden');
            if (sheetEl) sheetEl.classList.add('is-hidden');
        }
    },

    renderCharacterGrid() {
        if (DEBUG_MANAGER) {
            console.log('🎨 RENDER: Starting grid render with', AppState.filteredCharacters.length, 'characters');
            console.log('🎨 RENDER: Character names:', AppState.filteredCharacters.map(c => c.name).join(', '));
        }
        const grid = document.getElementById('characterGrid');
        const emptyState = document.getElementById('emptyState');
        const characters = AppState.filteredCharacters;

        if (characters.length === 0) {
            // Show a single "New Character" card in the grid, positioned as the
            // first card would be when characters exist.
            grid.innerHTML = `<div class="character-card new-character-card"onclick="createNewCharacter()"><div class="card-details"><div class="card-name">+New Character</div></div></div>`;

            if (emptyState) {
                emptyState.classList.remove('show');
            }
            KeyboardNav.isActive = true;
            KeyboardNav.reset();
            return;
        }

        emptyState.classList.remove('show');
        grid.innerHTML = characters.map(char => this.renderCharacterCard(char)).join('');
        
        // Check portrait view mode preference
        let portraitViewMode = 'original';
        try {
            if (window.StorageService && StorageService.getPortraitViewMode) {
                portraitViewMode = StorageService.getPortraitViewMode();
            } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
            }
        } catch (e) {
            // Non-fatal: keep default
        }
        
        // Populate ASCII thumbnails after rendering (only when not showing original images)
        characters.forEach(char => {
            const thumbnailEl = document.getElementById(`card-thumb-${char.id}`);
            if (!thumbnailEl) return;
            
            // Skip if this is an image thumbnail (already rendered in HTML)
            if (thumbnailEl.classList.contains('card-thumbnail--image')) return;
            
            // Use the same portrait selection logic as the character sheet so
            // cards and detail views stay in sync.
            const asciiPortrait = window.CharacterSheet
                ? window.CharacterSheet.getAsciiPortrait(char)
                : (char.customPortraitAscii || char.portrait?.ascii || char.asciiPortrait || null);
            if (asciiPortrait) {
                // Use <pre> wrapper for proper CSS flex centering
                thumbnailEl.innerHTML = '';
                const pre = document.createElement('pre');
                pre.textContent = this.cropAsciiForThumbnail(asciiPortrait);
                thumbnailEl.appendChild(pre);
            }
        });
        
        // Reset keyboard navigation to first card
        KeyboardNav.isActive = true;
        KeyboardNav.reset();
    },
    
    cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
        // Split into lines
        const lines = asciiArt.split('\n');
        
        // VERTICAL: Crop from bottom only (keep top pinned for faces/heads)
        const totalLines = lines.length;
        const startLine = 0;
        const endLine = Math.min(totalLines, heightLines);
        
        // HORIZONTAL: Crop equally from both sides to stay centered
        const topLines = lines.slice(startLine, endLine).map(line => {
            if (line.length <= widthChars) return line;
            const excess = line.length - widthChars;
            const cropLeft = Math.floor(excess / 2);
            return line.slice(cropLeft, cropLeft + widthChars);
        });
        
        return topLines.join('\n');
    },

    renderCharacterCard(character) {
        // Handle race/class names (enhanced export has nested data)
        const raceNameRaw = character.raceData?.name || character.race || '?';
        const classNameRaw = character.classData?.name || character.class || '?';
        const raceClassSentence = toSentenceCase(`${raceNameRaw}\u0020${classNameRaw}`.trim());
        const raceClass = Utils.escapeHtml(raceClassSentence || '?');
        const name = Utils.escapeHtml(character.name || 'Unnamed Character');
        
        // Get ASCII portrait for thumbnail using shared logic so the card
        // matches the character sheet view.
        const asciiPortrait = window.CharacterSheet
            ? window.CharacterSheet.getAsciiPortrait(character)
            : (character.customPortraitAscii || character.portrait?.ascii || character.asciiPortrait || null);
        const hasAsciiPortrait = asciiPortrait && asciiPortrait.length > 0;
        
        // Get original portrait URL
        const originalPortraitUrl = window.CharacterSheet
            ? window.CharacterSheet.getOriginalPortraitUrl(character)
            : (character.originalPortraitUrl || character.portrait?.url || null);

        // Debug logging for portrait mismatch investigation
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️[PORTRAIT DEBUG]renderCharacterCard`, {
                characterId: character.id,
                characterName: character.name,
                context: 'card',
                hasAscii: hasAsciiPortrait,
                asciiLength: asciiPortrait?.length || 0,
                url: originalPortraitUrl,
                portraitMetadataActiveId: character.portraitMetadata?.activeVersionId || null,
                portraitMetadataVersionsCount: character.portraitMetadata?.versions?.length || 0
            });
        }
        
        // Check portrait view mode preference
        let portraitViewMode = 'original';
        try {
            if (window.StorageService && StorageService.getPortraitViewMode) {
                portraitViewMode = StorageService.getPortraitViewMode();
            } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
            }
        } catch (e) {
            // Non-fatal: keep default
        }
        
        // Determine which thumbnail to show
        const showOriginalImage = portraitViewMode === 'original' && !!originalPortraitUrl;
        const hasPortrait = hasAsciiPortrait || !!originalPortraitUrl;
        
        let thumbnailHtml = '';
        if (hasPortrait) {
            if (showOriginalImage) {
                // Show original image (onload adds is-loaded class for fade-in effect)
                thumbnailHtml = `<div class="card-thumbnail card-thumbnail--image"id="card-thumb-${character.id}"><img src="${Utils.escapeHtml(originalPortraitUrl)}"alt="${name}"loading="lazy"onload="this.classList.add('is-loaded')"/></div>`;
            } else if (hasAsciiPortrait) {
                // Show ASCII art (content will be populated after render)
                thumbnailHtml = `<div class="card-thumbnail"id="card-thumb-${character.id}"></div>`;
            }
        }

        // Check if this is a demo character
        const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
        const demoTagHtml = isDemo ? '<span class="card-demo-tag">SAMPLE</span>' : '';

        return `<div class="character-card"data-id="${character.id}"onclick="viewCharacter('${character.id}')">${demoTagHtml}
${thumbnailHtml}<div class="card-details"><div class="card-name">${name}</div><div class="card-info">${raceClass}${character.level?` • Lvl ${character.level}`:''}</div></div></div>`;
    },

    updateCount() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const countEl = document.getElementById('searchCharacterCount');
        const total = AppState.characters.length;
        const filtered = AppState.filteredCharacters.length;

        // Disable search when there are no characters at all
        if (searchInput) {
            searchInput.disabled = total === 0;
            // Include character count in placeholder (truncate on mobile)
            if (total === 0 || MobileView.isMobile()) {
                searchInput.placeholder = 'Search';
            } else {
                searchInput.placeholder = 'Search ' + total + ' character' + (total !== 1 ? 's' : '');
            }
        }
        if (clearSearchBtn) {
            clearSearchBtn.disabled = total === 0;
        }

        // Show filtered count only when actively filtering
        if (countEl) {
            if (filtered < total && total > 0) {
                countEl.textContent = filtered + ' of ' + total;
            } else {
                countEl.textContent = '';
            }
        }
    },

    showCharacterSheet(character) {
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetContainer = document.getElementById('characterSheet');

        placeholder.classList.add('is-hidden');
        sheetContainer.classList.remove('is-hidden');
        
        // Check if this is a demo character - disable editing if so
        const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
        // Check if user is in demo mode (not authenticated) - sharing requires login
        const isDemoMode = window.DemoCharacters && window.DemoCharacters.isDemoMode();
        
        // Use the shared CharacterSheet component
        // Demo characters cannot be edited, renamed, deleted, or have portraits generated
        sheetContainer.innerHTML = CharacterSheet.render(character, {
            context: 'manager',
            showPortrait: true,
            onRename: !isDemo,
            onEdit: !isDemo,
            onDelete: !isDemo,
            onGeneratePortrait: !isDemo,
            onPrint: true,
            onShare: !isDemo && !isDemoMode,  // Sharing requires login; demo chars can't be shared
        });
        
        // Populate ASCII portrait after rendering
        CharacterSheet.populatePortrait(character);
    }
};

// Simple print helper for manager context – relies on print-specific CSS
// to hide the left panel and UI chrome, focusing on the sheet content.
function printCharacterSheet() {
    if (!document.querySelector('.character-sheet')) {
        alert('No character sheet to print yet.');
        return;
    }
    window.print();
}

// ========================================
// EVENT HANDLERS
// ========================================

function createNewCharacter() {
    // In demo mode, check if user has reached the character limit
    if (window.DemoCharacters && DemoCharacters.hasReachedCharacterLimit()) {
        const limit = DemoCharacters.DEMO_MAX_USER_CHARACTERS;
        showAlertDialog(
            'You\'ve reached the limit of ' + limit + ' characters in guest mode. Log in or create a free account to save unlimited characters!',
            {
                actionLabel: 'Log in',
                onAction: () => {
                    showAuthModal();
                }
            }
        );
        return;
    }
    
    // Check if creation quota is exhausted (checked in _creationQuotaRemaining)
    if (typeof _creationQuotaRemaining === 'number' && _creationQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for character creation. Come back tomorrow for more adventures!"
        );
        return;
    }
    
    // Launch the Character Builder in the same tab.
    // The builder has an EXIT button to return to the manager view.
    window.location.href = 'character-builder/index.html';
}

// Track creation quota state for NEW CHARACTER button
let _creationQuotaRemaining = null;

// Track image quota state for Customize portrait button (exposed globally for shared-character-sheet.js)
window._imageQuotaRemaining = null;

/**
 * Fetch and update the creation quota state.
 * Updates the NEW CHARACTER button's disabled state and title.
 */
async function updateCreationQuotaState() {
    const btn = document.getElementById('newCharacterBtn');
    const overflowBtn = document.getElementById('overflowNewCharBtn');
    const tooltip = document.getElementById('newCharacterTooltip');
    
    // Helper to update both buttons and the custom tooltip
    const updateButtons = (disabled, tooltipText, addClass) => {
        [btn, overflowBtn].forEach(b => {
            if (!b) return;
            b.disabled = disabled;
            // Clear native title - we use custom tooltip now
            b.title = '';
            if (addClass) {
                b.classList.add('is-quota-exhausted');
            } else {
                b.classList.remove('is-quota-exhausted');
            }
        });
        // Update the custom tooltip text
        if (tooltip) {
            tooltip.textContent = tooltipText;
        }
    };

    if (!btn && !overflowBtn) return;

    try {
        // Use AIService if available, otherwise make direct fetch
        let quota = null;
        if (window.AIService && typeof AIService.getCreationQuotaStatus === 'function') {
            quota = await AIService.getCreationQuotaStatus();
        } else {
            // Fallback: direct fetch (manager page may not have AIService loaded)
            // IMPORTANT: Include auth token so admins bypass quota
            const headers = { 'Content-Type': 'application/json' };
            const token = window.AuthService?.getToken?.();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendUrl = window.DanddyConfig?.BACKEND_ORIGIN || window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(
                `${backendUrl}/api/ai/characters/quota`,
                { method: 'GET', headers }
            );
            if (response.ok) {
                quota = await response.json();
            }
        }

        if (!quota) {
            // Quota check failed - allow user to proceed (fail open)
            _creationQuotaRemaining = null;
            updateButtons(false, '', false);
            return;
        }

        _creationQuotaRemaining = quota.remaining;

        // If remaining is -1, quota is not enforced (admin/dev mode)
        if (quota.remaining === -1) {
            updateButtons(false, '', false);
            return;
        }

        if (quota.remaining === 0) {
            updateButtons(true, 'Daily limit reached', true);
        } else {
            updateButtons(false, `${quota.remaining}${' '}creation${quota.remaining===1?'':'s'}${' '}remaining`, false);
        }
    } catch (e) {
        console.warn('Failed to check creation quota:', e);
        // Fail open - allow user to proceed
        _creationQuotaRemaining = null;
        updateButtons(false, '', false);
    }
}

/**
 * Fetch and update the image quota state.
 * Used to disable "Customize portrait" button when exhausted.
 */
async function updateImageQuotaState() {
    try {
        let quota = null;
        if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
            quota = await AIService.getImageQuotaStatus();
        } else {
            // Include auth token so admins bypass quota
            const headers = { 'Content-Type': 'application/json' };
            const token = window.AuthService?.getToken?.();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendUrl = window.DanddyConfig?.BACKEND_ORIGIN || window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(
                `${backendUrl}/api/ai/images/quota`,
                { method: 'GET', headers }
            );
            if (response.ok) {
                quota = await response.json();
            }
        }

        const oldRemaining = window._imageQuotaRemaining;

        if (!quota) {
            window._imageQuotaRemaining = null;
            return;
        }

        window._imageQuotaRemaining = quota.remaining;
        
        // Re-render current character sheet to update Customize portrait button state
        // This ensures the button is correctly disabled on initial load when quota is exhausted
        // Only re-render if quota was previously unknown (null) or changed
        if (oldRemaining !== quota.remaining && AppState.selectedCharacterId) {
            viewCharacter(AppState.selectedCharacterId, { skipKeyboardSync: true });
        }
    } catch (e) {
        console.warn('Failed to check image quota:', e);
        window._imageQuotaRemaining = null;
    }
}

async function viewCharacter(id, options = {}) {
    const { 
        fromKeyboard = false, 
        skipKeyboardSync = false, 
        updateUrl = true,
        openMobileModal = true  // Whether to open modal on mobile (true for user clicks)
    } = options;

    // Record this request so that slower async lookups for previously
    // selected characters can't override the sheet for the most recently
    // clicked or focused card.
    const requestId = ++latestViewCharacterRequestId;

    // Debug logging for portrait mismatch investigation
    if (window.DEBUG_PORTRAITS) {
        console.log(`🖼️[PORTRAIT DEBUG]viewCharacter called`, {
            id,
            requestId,
            options,
            timestamp: new Date().toISOString()
        });
    }

    if (typeof AppState !== 'undefined' && AppState) {
        AppState.selectedCharacterId = id;
    }

    // Prefer the already-loaded characters from AppState to avoid extra storage/API calls
    // Use String() comparison to handle type mismatches (cloud IDs may be numeric,
    // but onclick handlers pass string IDs)
    let character = null;
    let characterSource = null;
    if (typeof AppState !== 'undefined' && AppState && Array.isArray(AppState.filteredCharacters)) {
        const idStr = String(id);
        character = AppState.filteredCharacters.find(c => c && String(c.id) === idStr);
        if (character) {
            characterSource = 'filteredCharacters';
        } else {
            character = AppState.characters.find(c => c && String(c.id) === idStr);
            if (character) characterSource = 'characters';
        }
    }

    if (!character) {
        // Fallback to storage lookup (cloud/local)
        try {
            character = await CharacterStorage.getById(id);
            characterSource = 'storage';
        } catch (error) {
            // Check if this is a session expiry error
            if (error.message && error.message.includes('Session expired')) {
                showSessionExpiredModal();
                return;
            }
            // Log other errors but don't block - character will just be null
            console.warn('Failed to load character from storage:', error);
        }
    }

    // If a newer viewCharacter call started while we were waiting on
    // storage/cloud, abandon this update to avoid stale mismatches.
    if (requestId !== latestViewCharacterRequestId) {
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️[PORTRAIT DEBUG]viewCharacter ABANDONED(stale request)`, {
                id,
                requestId,
                latestRequestId: latestViewCharacterRequestId
            });
        }
        return;
    }

    if (character) {
        // Debug: Log the character data being used to render the sheet
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️[PORTRAIT DEBUG]viewCharacter rendering`, {
                id: character.id,
                name: character.name,
                source: characterSource,
                requestId,
                portraitMetadataActiveId: character.portraitMetadata?.activeVersionId || null,
                portraitMetadataVersionsCount: character.portraitMetadata?.versions?.length || 0,
                originalPortraitUrl: character.originalPortraitUrl || null,
                portraitUrl: character.portrait?.url || null,
                hasCustomPortraitAscii: !!character.customPortraitAscii,
                hasAsciiPortrait: !!character.asciiPortrait,
                timestamp: new Date().toISOString()
            });
        }
        UI.showCharacterSheet(character);
        
        // Update URL with selected character (for sharing/bookmarking)
        if (updateUrl && id) {
            updateUrlWithCharacter(id);
        }
        
        // Highlight selected card
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('is-selected');
        });
        const selectedCard = document.querySelector(`[data-id="${id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('is-selected');

            // When selection changes via mouse or programmatic calls, keep the
            // keyboard focus index in sync without re-triggering a sheet update.
            if (!skipKeyboardSync && typeof KeyboardNav !== 'undefined' && KeyboardNav.getCharacterCards) {
                const allCards = KeyboardNav.getCharacterCards();
                const cardIndex = allCards.indexOf(selectedCard);
                if (cardIndex !== -1) {
                    KeyboardNav.currentFocusIndex = cardIndex;
                    KeyboardNav.updateFocus(true); // true => don't update sheet again
                }
            }
        }

        // On mobile, open the character sheet view after rendering
        const isMobile = typeof MobileView !== 'undefined' && MobileView.isMobile();
        if (isMobile && openMobileModal) {
            // Use double requestAnimationFrame to ensure the DOM has painted
            // before cloning. This is more reliable than a fixed timeout as it
            // waits for the browser's actual rendering cycle to complete.
            // First rAF schedules for next frame, second ensures paint occurred.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Verify this is still the selected character before opening
                    // (prevents race condition if user tapped another card quickly)
                    if (AppState.selectedCharacterId === id) {
                        MobileView.open(id);
                    }
                });
            });
        }
    }
}

// Update URL with character ID without triggering page reload
function updateUrlWithCharacter(characterId) {
    const url = new URL(window.location.href);
    if (characterId) {
        url.searchParams.set('character', characterId);
    } else {
        url.searchParams.delete('character');
    }
    // Remove 'from' param if present (one-time use)
    url.searchParams.delete('from');
    history.replaceState({ characterId }, '', url.toString());
}

// Get character ID from URL
function getCharacterIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('character');
}

// Clear character selection from URL
function clearCharacterFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('character');
    history.replaceState({}, '', url.toString());
}

let currentEditCharacterId = null;
let originalEditLevel = null;
// Store the original modal content HTML so we can restore it after level change dialog
let originalEditModalContent = null;

function selectAlignment(value, label) {
    // Update hidden select value
    const select = document.getElementById('editAlignment');
    if (select) {
        select.value = value;
    }
    
    // Update visible trigger label
    const labelEl = document.getElementById('editAlignment-label');
    if (labelEl) {
        labelEl.textContent = label;
    }
    
    // Update selected state in menu options
    const trigger = document.getElementById('editAlignment-trigger');
    if (trigger) {
        const shell = trigger.closest('.selector-shell');
        if (shell) {
            const options = shell.querySelectorAll('.selector-option');
            options.forEach(opt => {
                const isSelected = opt.getAttribute('data-value') === value;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }
    }
}

function selectSex(value, label) {
    // Update hidden select value
    const select = document.getElementById('editSex');
    if (select) {
        select.value = value;
    }
    
    // Update visible trigger label
    const labelEl = document.getElementById('editSex-label');
    if (labelEl) {
        labelEl.textContent = label;
    }
    
    // Update selected state in menu options
    const trigger = document.getElementById('editSex-trigger');
    if (trigger) {
        const shell = trigger.closest('.selector-shell');
        if (shell) {
            const options = shell.querySelectorAll('.selector-option');
            options.forEach(opt => {
                const isSelected = opt.getAttribute('data-value') === value;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }
    }
}

async function editCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    currentEditCharacterId = id;

    // Ensure the modal content is restored to the original form HTML.
    // This is necessary because showLevelChangeDialog replaces the content
    // with a loading spinner when auto-calculating stats, and that content
    // may persist if the modal wasn't fully closed before opening again.
    const modal = document.getElementById('editDetailsModal');
    if (modal) {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            // Store original content on first open if not already stored
            if (!originalEditModalContent) {
                originalEditModalContent = modalContent.innerHTML;
            } else {
                // Restore original content in case it was replaced by level change dialog
                modalContent.innerHTML = originalEditModalContent;
            }
        }
        // Also ensure any stale closing state is cleared
        modal.classList.remove('closing');
    }

    // Use parsed data to pre-fill, so we respect any derived values
    const parsed = CharacterSheet._parseCharacterData(character);

    // Helper to safely set textarea values
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    // CHARACTER NAME
    setValue('editName', character.name || '');

    // LEVEL - store original for change detection (ensure it's a number)
    const level = parsed.level != null ? Number(parsed.level) : Number(character.level || 1);
    originalEditLevel = level;
    setValue('editLevel', level);

    // ALIGNMENT (default to 'n' - True Neutral if not set)
    const alignmentValue = character.alignment || 'n';
    setValue('editAlignment', alignmentValue);

    // SEX
    const sexValue = character.sex || '';
    setValue('editSex', sexValue);

    // ABILITY SCORES
    const abilities = parsed.abilities || {};
    setValue('editStr', abilities.str != null ? abilities.str : '');
    setValue('editDex', abilities.dex != null ? abilities.dex : '');
    setValue('editCon', abilities.con != null ? abilities.con : '');
    setValue('editInt', abilities.int != null ? abilities.int : '');
    setValue('editWis', abilities.wis != null ? abilities.wis : '');
    setValue('editCha', abilities.cha != null ? abilities.cha : '');

    // COMBAT STATS (match sheet's Combat Stats section)
    setValue('editHpMax', parsed.hpMax != null ? parsed.hpMax : '');
    setValue('editHpCurrent', parsed.hpCurrent != null ? parsed.hpCurrent : '');
    const tempHp =
        character.hitPoints && typeof character.hitPoints === 'object'
            ? character.hitPoints.temp || 0
            : 0;
    setValue('editHpTemp', tempHp);
    setValue('editArmorClass', parsed.armorClass != null ? parsed.armorClass : '');
    setValue('editInitiative', parsed.initiative != null ? parsed.initiative : '');
    setValue('editSpeed', parsed.speed != null ? parsed.speed : '');
    setValue('editProfBonus', parsed.proficiencyBonus != null ? parsed.proficiencyBonus : '');

    // SKILL PROFICIENCIES (text-only list, one per line)
    const skillList = (parsed.skillProficiencies || []).map(s => CharacterSheet.formatSkillName(s)).join('\n');
    setValue('editSkills', skillList);

    // CLASS EQUIPMENT / EQUIPMENT (one per line)
    const equipmentList = (parsed.equipment || []).join('\n');
    setValue('editEquipment', equipmentList);

    // TOOL PROFICIENCIES (one per line)
    const toolList = (parsed.toolProficiencies || []).map(t => CharacterSheet.formatSkillName(t)).join('\n');
    setValue('editTools', toolList);

    // LANGUAGES (one per line)
    const languageList = (parsed.languages || []).join('\n');
    setValue('editLanguages', languageList);

    // BACKSTORY (free text)
    setValue('editBackstory', character.backstory || '');

    // Show modal (reuse modal variable from earlier in function)
    if (modal) {
        modal.classList.add('show');
        
        // Snapshot form values for dirty checking (after a tick to let values settle)
        setTimeout(() => ModalManager.snapshotForm('editDetailsModal'), 50);
        
        // Update alignment selector after modal is visible (needs to be deferred)
        const savedAlignmentValue = alignmentValue; // Capture in closure
        const savedSexValue = sexValue; // Capture in closure
        setTimeout(() => {
            const alignmentNames = {
                'lg': 'Lawful Good',
                'ng': 'Neutral Good',
                'cg': 'Chaotic Good',
                'ln': 'Lawful Neutral',
                'n': 'True Neutral',
                'cn': 'Chaotic Neutral',
                'le': 'Lawful Evil',
                'ne': 'Neutral Evil',
                'ce': 'Chaotic Evil'
            };
            const alignmentName = alignmentNames[savedAlignmentValue] || 'Select Alignment';
            const alignmentLabel = document.getElementById('editAlignment-label');
            if (alignmentLabel) {
                alignmentLabel.textContent = alignmentName;
            }
            
            // Mark selected option in menu
            const alignmentTrigger = document.getElementById('editAlignment-trigger');
            if (alignmentTrigger) {
                const shell = alignmentTrigger.closest('.selector-shell');
                if (shell) {
                    const options = shell.querySelectorAll('.selector-option');
                    options.forEach(opt => {
                        const isSelected = opt.getAttribute('data-value') === savedAlignmentValue;
                        opt.classList.toggle('is-selected', isSelected);
                        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    });
                }
            }

            // Update sex selector
            const sexNames = {
                'male': 'Male',
                'female': 'Female'
            };
            const sexName = sexNames[savedSexValue] || 'Select Sex';
            const sexLabel = document.getElementById('editSex-label');
            if (sexLabel) {
                sexLabel.textContent = sexName;
            }
            
            // Mark selected option in sex menu
            const sexTrigger = document.getElementById('editSex-trigger');
            if (sexTrigger) {
                const shell = sexTrigger.closest('.selector-shell');
                if (shell) {
                    const options = shell.querySelectorAll('.selector-option');
                    options.forEach(opt => {
                        const isSelected = opt.getAttribute('data-value') === savedSexValue;
                        opt.classList.toggle('is-selected', isSelected);
                        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    });
                }
            }
        }, 0);
    }
}

function closeEditDetailsModal() {
    const modal = document.getElementById('editDetailsModal');
    if (!modal) {
        currentEditCharacterId = null;
        originalEditLevel = null;
        return;
    }

    // Hide loading overlay when modal closes
    const loadingOverlay = document.getElementById('editDetailsLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('is-visible');
    }

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: () => {
            currentEditCharacterId = null;
            originalEditLevel = null;
        },
    });
}

async function saveEditDetails() {
    if (!currentEditCharacterId) {
        closeEditDetailsModal();
        return;
    }

    const character = await CharacterStorage.getById(currentEditCharacterId);
    if (!character) {
        closeEditDetailsModal();
        return;
    }

    // Show loading overlay
    const loadingOverlay = document.getElementById('editDetailsLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('is-visible');
    }

    const getLines = (id) => {
        const el = document.getElementById(id);
        if (!el) return [];
        return el.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    };

    const skillLines = getLines('editSkills');
    const equipmentLines = getLines('editEquipment');
    const toolLines = getLines('editTools');
    const languageLines = getLines('editLanguages');

    const backstoryEl = document.getElementById('editBackstory');
    const backstoryText = backstoryEl ? backstoryEl.value.trim() : '';
    
    const nameEl = document.getElementById('editName');
    const nameText = nameEl ? nameEl.value.trim() : '';

    const getNumber = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const raw = el.value.trim();
        if (!raw) return null;
        const value = parseInt(raw, 10);
        return Number.isFinite(value) ? value : null;
    };

    const levelValue = getNumber('editLevel');
    
    // Validate level range (D&D 5e: 1-20)
    if (levelValue !== null && (levelValue < 1 || levelValue > 20)) {
        // Hide loading overlay while showing validation error
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
        showAlertDialog(`Level must be between 1 and 20.\n\nYou entered:${levelValue}`);
        return;
    }
    
    // Check if level has changed - prompt user for stat recalculation choice
    const safeLevel = levelValue;
    let levelChangeChoice = 'manual'; // default to manual if no change
    let autoCalculatedStats = null;
    
    if (safeLevel !== null && originalEditLevel !== null && safeLevel !== originalEditLevel) {
        // Hide loading overlay while showing the dialog
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
        
        levelChangeChoice = await showLevelChangeDialog(originalEditLevel, safeLevel);
        
        if (levelChangeChoice === 'cancel' || levelChangeChoice === 'manual') {
            // User cancelled or chose manual - return to edit form without saving
            return;
        }
        
        // Show loading overlay again after dialog closes
        if (loadingOverlay) {
            loadingOverlay.classList.add('is-visible');
        }
        
        if (levelChangeChoice === 'auto') {
            // Calculate stats based on the new level and current abilities
            const formAbilities = {
                str: getNumber('editStr') ?? character.abilities?.str ?? 10,
                dex: getNumber('editDex') ?? character.abilities?.dex ?? 10,
                con: getNumber('editCon') ?? character.abilities?.con ?? 10,
                int: getNumber('editInt') ?? character.abilities?.int ?? 10,
                wis: getNumber('editWis') ?? character.abilities?.wis ?? 10,
                cha: getNumber('editCha') ?? character.abilities?.cha ?? 10,
            };
            const tempCharacter = { ...character, abilities: formAbilities };
            autoCalculatedStats = calculateStatsForLevel(tempCharacter, safeLevel);
        }
    }

    // Ability scores
    const abilityUpdates = {};
    const str = getNumber('editStr');
    const dex = getNumber('editDex');
    const con = getNumber('editCon');
    const intScore = getNumber('editInt');
    const wis = getNumber('editWis');
    const cha = getNumber('editCha');

    if (str !== null) abilityUpdates.str = str;
    if (dex !== null) abilityUpdates.dex = dex;
    if (con !== null) abilityUpdates.con = con;
    if (intScore !== null) abilityUpdates.int = intScore;
    if (wis !== null) abilityUpdates.wis = wis;
    if (cha !== null) abilityUpdates.cha = cha;

    // Combat stats - use auto-calculated values if user chose auto, otherwise use form values
    let hpMax = getNumber('editHpMax');
    let hpCurrent = getNumber('editHpCurrent');
    const hpTemp = getNumber('editHpTemp');
    const armorClass = getNumber('editArmorClass');
    const initiative = getNumber('editInitiative');
    const speed = getNumber('editSpeed');
    let profBonus = getNumber('editProfBonus');
    
    // Apply auto-calculated stats if user chose auto
    if (autoCalculatedStats) {
        hpMax = autoCalculatedStats.hpMax;
        // Set current HP to max HP when auto-calculating (leveling up usually means full health)
        hpCurrent = autoCalculatedStats.hpMax;
        profBonus = autoCalculatedStats.proficiencyBonus;
    }

    // Alignment
    const alignmentValue = document.getElementById('editAlignment')?.value || '';

    // Sex
    const sexValue = document.getElementById('editSex')?.value || '';

    const updates = {
        // Store raw IDs/names; CharacterSheet will format as needed
        skillProficiencies: skillLines.map(s => s.toLowerCase().replace(/\s+/g, '-')),
        equipment: equipmentLines,
        toolProficiencies: toolLines.map(t => t.toLowerCase().replace(/\s+/g, '-')),
        languages: languageLines,
        backstory: backstoryText,
    };
    
    // Only update name if non-empty (prevent accidental wiping)
    if (nameText) {
        updates.name = nameText;
    } else {
        console.warn('⚠️ EDIT: Name field was empty - preserving existing name');
    }

    if (levelValue !== null) {
        updates.level = levelValue;
    }

    if (alignmentValue) {
        updates.alignment = alignmentValue;
    }

    if (sexValue) {
        updates.sex = sexValue;
    }

    if (Object.keys(abilityUpdates).length > 0) {
        updates.abilities = {
            ...(character.abilities || character.abilityScores || {}),
            ...abilityUpdates,
        };
    }

    const hasHpUpdate = hpMax !== null || hpCurrent !== null || hpTemp !== null;
    if (hasHpUpdate) {
        const prevHp = character.hitPoints;
        const baseHp =
            prevHp && typeof prevHp === 'object'
                ? { ...prevHp }
                : { max: prevHp || 0, current: prevHp || 0, temp: 0 };
        if (hpMax !== null) baseHp.max = hpMax;
        if (hpCurrent !== null) baseHp.current = hpCurrent;
        if (hpTemp !== null) baseHp.temp = hpTemp;
        updates.hitPoints = baseHp;
    }

    if (armorClass !== null) {
        updates.armorClass = armorClass;
    }
    if (initiative !== null) {
        updates.initiative = initiative;
    }
    if (speed !== null) {
        updates.speed = speed;
    }
    if (profBonus !== null) {
        updates.proficiencyBonus = profBonus;
    }

    try {
        await CharacterStorage.update(currentEditCharacterId, updates);
        markUserChanges(); // Show guest notice if applicable
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(currentEditCharacterId);
        showNotification('Character details updated');
        closeEditDetailsModal();
    } catch (error) {
        console.error('Failed to save character details:', error);
        showNotification('Failed to save changes', 'error');
    } finally {
        // Hide loading overlay
        const loadingOverlay = document.getElementById('editDetailsLoading');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
    }
}

// Resolve the best host element for manager UI modals so that they are
// visually scoped to the terminal frame instead of the full viewport.
function getManagerModalHost() {
    return (
        document.querySelector('.terminal-frame') ||
        document.querySelector('.terminal-container') ||
        document.body
    );
}

async function renameCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    const existing = document.getElementById('renameModal');
    if (existing) existing.remove();

    const safeCurrentName = Utils.escapeHtml(character.name || '');
    const modalHtml = `<div id="renameModal"class="modal show"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">RENAME CHARACTER</h2><button class="modal-close"onclick="closeRenameModal()">&times;</button></div><div class="modal-body"><p class="terminal-text-small modal-section-label">New name:</p><input type="text"id="renameInput"class="terminal-input"value="${safeCurrentName}"></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"id="renameCancel">CANCEL</button><button class="terminal-btn terminal-btn-primary"id="renameOk">APPLY</button></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');
    const cancelBtn = document.getElementById('renameCancel');
    const okBtn = document.getElementById('renameOk');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', async () => {
        const newName = input.value.trim();
        if (!newName) {
            return;
        }
        close();
        await CharacterStorage.update(id, { name: newName });
        markUserChanges(); // Show guest notice if applicable
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(id);
        showNotification('Character renamed to: ' + newName);
    });

    // Focus first field in the rename modal
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    } else if (input) {
        input.focus();
        input.select();
    }
}

// ========================================
// CHARACTER SHARING
// ========================================

/**
 * Open the share character modal.
 * @param {string|number} characterId - The character ID to share
 */
async function openShareModal(characterId) {
    // Must be logged in to share
    if (!AuthService.isAuthenticated()) {
        showNotification('Please log in to share characters', 'error');
        return;
    }

    const character = await CharacterStorage.getById(characterId);
    if (!character) {
        showNotification('Character not found', 'error');
        return;
    }

    const existing = document.getElementById('shareModal');
    if (existing) existing.remove();

    const safeName = Utils.escapeHtml(character.name || 'Unnamed');
    const modalHtml = `<div id="shareModal"class="modal show"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">SHARE CHARACTER</h2><button class="modal-close"onclick="closeShareModal()">&times;</button></div><div class="modal-body"><p class="terminal-text">Share${' '}<strong>${safeName}</strong>${' '}with another DandDy user.</p><p class="terminal-text-small terminal-text-dim"style="margin-top: 0.5rem;">Enter their email address.${' '}If they have a DandDy account,${' '}they'll see this character the next time they log in and can add it to their collection.</p><div style="margin-top: 1rem;"><label class="terminal-text-small modal-section-label"for="shareEmailInput">Email address:</label><input type="email"id="shareEmailInput"class="terminal-input"placeholder="friend@example.com"><p id="shareEmailError"class="terminal-text-small"style="color: var(--error-color, #f44); margin-top: 0.25rem; display: none;"></p></div></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"id="shareCancel">CANCEL</button><button class="terminal-btn terminal-btn-primary"id="shareSend">SEND</button></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('shareModal');
    const input = document.getElementById('shareEmailInput');
    const errorEl = document.getElementById('shareEmailError');
    const cancelBtn = document.getElementById('shareCancel');
    const sendBtn = document.getElementById('shareSend');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    };

    const clearError = () => {
        errorEl.style.display = 'none';
    };

    // Simple email validation
    const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    cancelBtn.addEventListener('click', close);
    
    input.addEventListener('input', clearError);

    sendBtn.addEventListener('click', async () => {
        const email = input.value.trim().toLowerCase();
        
        if (!email) {
            showError('Please enter an email address');
            return;
        }
        
        if (!isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }

        // Disable button while processing
        sendBtn.disabled = true;
        sendBtn.textContent = 'SENDING...';

        try {
            await CharacterCloudStorage.shareCharacter(characterId, email);
            close();
            showNotification(`${safeName}${' '}shared with ${email}`);
        } catch (error) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'SEND';
            showError(error.message || 'Failed to share character');
        }
    });

    // Focus the email input
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    } else if (input) {
        input.focus();
    }
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

/**
 * Check for pending shares and show the modal if there are any.
 * Called after successful login.
 */
async function checkPendingShares() {
    if (!AuthService.isAuthenticated()) return;

    try {
        const pendingShares = await CharacterCloudStorage.getPendingShares();
        if (pendingShares && pendingShares.length > 0) {
            showPendingSharesModal(pendingShares);
        }
    } catch (error) {
        console.error('Failed to check pending shares:', error);
        // Don't show error to user - this is a background check
    }
}

/**
 * Show the pending shares modal with all pending character shares.
 * @param {Array} shares - Array of pending share objects
 */
function showPendingSharesModal(shares) {
    if (!shares || shares.length === 0) return;

    const existing = document.getElementById('pendingSharesModal');
    if (existing) existing.remove();

    const shareCount = shares.length;
    const title = shareCount === 1 ? 'CHARACTER SHARED WITH YOU' : `${shareCount}CHARACTERS SHARED WITH YOU`;

    // Build share cards HTML
    const shareCardsHtml = shares.map((share, index) => {
        const char = share.character;
        
        // Title case helper (e.g., "halfling" -> "Halfling", "neutral evil" -> "Neutral Evil")
        const toTitleCase = (str) => {
            if (!str) return '—';
            return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };
        
        const safeName = Utils.escapeHtml(char.name || 'Unnamed');
        const safeRace = Utils.escapeHtml(toTitleCase(char.race || 'Unknown'));
        const safeClass = Utils.escapeHtml(toTitleCase(char.character_class || 'Unknown'));
        const level = char.level || 1;
        const safeBackground = Utils.escapeHtml(toTitleCase(char.background || '—'));
        const fromEmail = Utils.escapeHtml(share.from_email || 'Unknown');
        
        // Format sex (title case)
        const safeSex = Utils.escapeHtml(toTitleCase(char.sex));
        
        // Format the date
        const createdDate = new Date(share.created_at);
        const dateStr = createdDate.toLocaleDateString();

        // Portrait: prefer image, fallback to ASCII, then placeholder
        let portraitHtml = '<div class="share-card-portrait-placeholder">No Portrait</div>';
        if (char.original_portrait_url) {
            // Image portrait
            portraitHtml = `<img class="share-card-portrait-image"src="${Utils.escapeHtml(char.original_portrait_url)}"alt="${safeName} portrait"/>`;
        } else if (char.ascii_portrait) {
            // ASCII portrait fallback
            portraitHtml = `<pre class="share-card-portrait">${Utils.escapeHtml(char.ascii_portrait)}</pre>`;
        }

        return `<div class="pending-share-card"data-share-id="${share.id}"data-index="${index}"><div class="share-card-layout"><div class="share-card-portrait-col">${portraitHtml}</div><div class="share-card-info-col"><h3 class="share-card-name">${safeName}</h3><div class="share-card-stats"><div class="share-card-stat"><span class="share-card-label">Race</span><span class="share-card-value">${safeRace}</span></div><div class="share-card-stat"><span class="share-card-label">Class</span><span class="share-card-value">${safeClass}</span></div><div class="share-card-stat"><span class="share-card-label">Level</span><span class="share-card-value">${level}</span></div></div><p class="share-card-from">From:${fromEmail}· ${dateStr}</p><div class="share-card-actions"><button class="terminal-btn pending-share-ignore"data-share-id="${share.id}">IGNORE</button><button class="terminal-btn pending-share-accept"data-share-id="${share.id}">ADD CHARACTER</button></div></div></div></div>`;
    }).join('');

    const modalHtml = `<div id="pendingSharesModal"class="modal show"><div class="modal-content pending-shares-modal"><div class="modal-header"><h2 class="modal-title">${title}</h2><button class="modal-close"onclick="closePendingSharesModal()">&times;</button></div><div class="modal-body"><p class="terminal-text-small terminal-text-dim"style="margin-bottom: 1rem;">${shareCount===1?'Someone shared a character with you!':'Other users have shared characters with you!'}
Add them to your collection or ignore to dismiss.</p><div class="pending-shares-list">${shareCardsHtml}</div></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('pendingSharesModal');

    // Add event listeners for accept/ignore buttons
    modal.querySelectorAll('.pending-share-accept').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const shareId = e.target.dataset.shareId;
            await handleAcceptShare(shareId);
        });
    });

    modal.querySelectorAll('.pending-share-ignore').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const shareId = e.target.dataset.shareId;
            await handleDismissShare(shareId);
        });
    });
}

/**
 * Handle accepting a pending share.
 * @param {string|number} shareId - The share ID to accept
 */
async function handleAcceptShare(shareId) {
    const card = document.querySelector(`.pending-share-card[data-share-id="${shareId}"]`);
    const acceptBtn = card?.querySelector('.pending-share-accept');
    
    if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'ADDING...';
    }

    try {
        const result = await CharacterCloudStorage.acceptShare(shareId);
        
        // Remove the card from the modal
        if (card) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            setTimeout(() => card.remove(), 300);
        }

        // Check if there are any cards left
        setTimeout(() => {
            const remainingCards = document.querySelectorAll('.pending-share-card');
            if (remainingCards.length === 0) {
                closePendingSharesModal();
            }
        }, 350);

        // Refresh the character list
        await AppState.loadCharacters();
        UI.render();
        
        showNotification('Character added to your collection!');
        
        // View the newly added character
        if (result && result.character_id) {
            viewCharacter(result.character_id);
        }
    } catch (error) {
        if (acceptBtn) {
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'ADD CHARACTER';
        }
        showNotification(error.message || 'Failed to add character', 'error');
    }
}

/**
 * Handle dismissing a pending share.
 * @param {string|number} shareId - The share ID to dismiss
 */
async function handleDismissShare(shareId) {
    const card = document.querySelector(`.pending-share-card[data-share-id="${shareId}"]`);
    const ignoreBtn = card?.querySelector('.pending-share-ignore');
    
    if (ignoreBtn) {
        ignoreBtn.disabled = true;
        ignoreBtn.textContent = 'IGNORING...';
    }

    try {
        await CharacterCloudStorage.dismissShare(shareId);
        
        // Remove the card from the modal
        if (card) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            setTimeout(() => card.remove(), 300);
        }

        // Check if there are any cards left
        setTimeout(() => {
            const remainingCards = document.querySelectorAll('.pending-share-card');
            if (remainingCards.length === 0) {
                closePendingSharesModal();
            }
        }, 350);

        showNotification('Share dismissed');
    } catch (error) {
        if (ignoreBtn) {
            ignoreBtn.disabled = false;
            ignoreBtn.textContent = 'IGNORE';
        }
        showNotification(error.message || 'Failed to dismiss share', 'error');
    }
}

function closePendingSharesModal() {
    const modal = document.getElementById('pendingSharesModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

let currentPortraitCharacterId = null;
let currentPortraitStyle = null;

/**
 * Convert a theme id/label to title case.
 * e.g., "cinematic-inks" -> "Cinematic Inks"
 *       "my-custom-style" -> "My Custom Style"
 */
function formatStyleLabel(idOrLabel) {
    if (!idOrLabel) return '';
    
    // Remove "Custom: " prefix if present
    let cleaned = String(idOrLabel).replace(/^Custom:\s*/i, '');
    
    // Remove " (default)" suffix
    cleaned = cleaned.replace(/\s*\(default\)\s*$/i, '');
    
    // Replace dashes/underscores with spaces
    cleaned = cleaned.replace(/[-_]/g, ' ');
    
    // Title case: capitalize first letter of each word
    if (cleaned.length > 0) {
        cleaned = cleaned.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }
    
    return cleaned;
}

/**
 * Populate the style listbox menu in the portrait prompt modal.
 * Uses the same selector pattern as the settings modal.
 * Returns the currently selected/default style ID.
 * 
 * This is now async to properly wait for API sync before fetching themes.
 */
async function populatePortraitStyleDropdown(activeStyle) {
    const menu = document.getElementById('portraitStyleMenu');
    const label = document.getElementById('portraitStyleLabel');
    if (!menu) return null;

    // Clear existing options
    menu.innerHTML = '';

    // Wait for API sync to complete before fetching themes
    // This ensures global styles are loaded for authenticated users
    if (window.PortraitPrompt && typeof PortraitPrompt.syncFromAPI === 'function') {
        try {
            await PortraitPrompt.syncFromAPI();
        } catch (e) {
            console.warn('populatePortraitStyleDropdown: API sync failed', e);
        }
    }

    // Get available themes from PortraitPrompt
    let themes = [];
    let defaultThemeId = 'cinematic-inks';
    
    try {
        if (window.PortraitPrompt) {
            if (typeof PortraitPrompt.getThemes === 'function') {
                themes = PortraitPrompt.getThemes() || [];
            }
            if (typeof PortraitPrompt.getDefaultThemeId === 'function') {
                defaultThemeId = PortraitPrompt.getDefaultThemeId() || defaultThemeId;
            }
        }
    } catch (e) {
        console.warn('populatePortraitStyleDropdown: Error getting themes', e);
    }

    // Always ensure at least the default theme is available
    if (!themes.length) {
        themes = [
            { id: 'cinematic-inks', label: 'Cinematic Inks (default)' }
        ];
    }

    // NOTE: Custom styles from admin storage are already included via PortraitPrompt.getThemes()
    // which properly handles API sync for authenticated users (including global vs user-owned filtering).
    // We no longer read localStorage directly here to avoid showing non-global styles
    // that may have been cached by another user on the same browser.

    // Sort themes alphabetically by id
    themes = themes.slice().sort((a, b) => {
        const nameA = (a.id || '').toLowerCase();
        const nameB = (b.id || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    // Determine selected value
    const selectedStyle = activeStyle || defaultThemeId;
    let selectedLabel = formatStyleLabel(defaultThemeId);

    // Populate menu with options (same pattern as settings modal)
    themes.forEach((theme) => {
        const formattedLabel = formatStyleLabel(theme.id);
        const isSelected = theme.id === selectedStyle;
        
        if (isSelected) {
            selectedLabel = formattedLabel;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'selector-option' + (isSelected ? ' is-selected' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('data-value', theme.id);
        button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        button.innerHTML = `<span class="selector-option-label">${formattedLabel}</span>`;
        menu.appendChild(button);
    });

    // Update trigger label
    if (label) {
        label.textContent = selectedLabel;
    }

    currentPortraitStyle = selectedStyle;
    
    // Wire up option clicks (same pattern as SettingsModal.initSelectors)
    initPortraitStyleSelector();
    
    return selectedStyle;
}

/**
 * Initialize the portrait style selector click handlers.
 * Uses the same pattern as SettingsModal.initSelectors.
 */
function initPortraitStyleSelector() {
    const menu = document.getElementById('portraitStyleMenu');
    const label = document.getElementById('portraitStyleLabel');
    const trigger = document.getElementById('portraitStyleTrigger');
    
    if (!menu) return;
    
    const options = menu.querySelectorAll('.selector-option');
    
    options.forEach((option) => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const optionLabel = option.querySelector('.selector-option-label');
            
            if (value && optionLabel) {
                // Update trigger label
                if (label) {
                    label.textContent = optionLabel.textContent.trim();
                }
                
                // Update current style
                currentPortraitStyle = value;
                
                // Update visual selection state
                options.forEach((opt) => {
                    const isSelected = opt.getAttribute('data-value') === value;
                    opt.classList.toggle('is-selected', isSelected);
                    opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                });
                
                // Close the menu using the standard toggle
                if (trigger && window.CharacterSheet && typeof CharacterSheet.toggleSelectorMenu === 'function') {
                    CharacterSheet.toggleSelectorMenu(trigger);
                }
            }
        });
    });
}

async function generatePortraitForCharacter(id) {
    let character;
    try {
        character = await CharacterStorage.getById(id);
    } catch (error) {
        // Check if this is a session expiry error
        if (error.message && error.message.includes('Session expired')) {
            // Session has expired - show the modal and don't proceed
            showSessionExpiredModal();
            return;
        }
        // Some other error - show alert
        console.error('Failed to load character for portrait generation:', error);
        showAlertDialog('Failed to load character. Please try again.');
        return;
    }
    
    if (!character) {
        // Character not found - might have been deleted or never synced
        showAlertDialog('Character not found. It may have been deleted or not yet synced.');
        return;
    }

    // Block custom art generation for sample (demo) characters
    if (window.DemoCharacters && DemoCharacters.isDemo(character)) {
        showAlertDialog(
            'Custom art generation is not available for sample characters. ' +
            'Create your own character to generate custom portraits!'
        );
        return;
    }

    // Check if image quota is exhausted (backend enforces daily limits)
    // Demo users get 5/day, logged-in users get 20/day
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        const isDemoMode = window.DemoCharacters && 
            typeof DemoCharacters.isDemoMode === 'function' && 
            DemoCharacters.isDemoMode();
        
        if (isDemoMode) {
            showAlertDialog(
                "You've reached the daily portrait limit in guest mode. Create an account for higher limits!",
                {
                    actionLabel: 'Create a free account',
                    onAction: () => {
                        showAuthModal();
                        showRegisterForm();
                    }
                }
            );
        } else {
            showAlertDialog(
                "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
            );
        }
        return;
    }

    // Check if race and class are defined
    if (!character.race || !character.class) {
        showAlertDialog('This character needs both a race and class to generate a custom portrait.');
        return;
    }

    // Check if backend is available
    try {
        const statusCheck = await fetch(`${window.CONFIG.BACKEND_URL}/api/ai/status`);
        if (!statusCheck.ok) {
            showAlertDialog('Backend server is not available. Make sure the backend is running on port 8000.');
            return;
        }
        const statusData = await statusCheck.json();
        if (!statusData.available) {
            showAlertDialog('AI features are not available. The backend server is not configured properly.');
            return;
        }
    } catch (error) {
        showAlertDialog('Cannot connect to backend server. Make sure it is running on http://localhost:8000');
        return;
    }

    // Show prompt modal
    currentPortraitCharacterId = id;
    
    // Build default prompt:
    // Use the stored characterDescription from the active portrait version if available.
    // This preserves the exact prompt the user used (or was auto-generated) for the
    // current portrait, allowing them to regenerate with a different style.
    // Fall back to buildCharacterDescription() for older portraits without this field.
    let defaultPrompt = '';
    let activeStyle = null;
    
    try {
        // Get the characterDescription and style from the active portrait version (if any)
        try {
            const metadata = character.portraitMetadata || {};
            const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
            if (versions.length) {
                const activeId = metadata.activeVersionId;
                let active =
                    (activeId && versions.find((v) => v && v.id === activeId)) ||
                    versions[versions.length - 1];
                // Get the characterDescription from the active version if available
                if (active && active.characterDescription) {
                    defaultPrompt = active.characterDescription;
                }
                // Get the style from the active version if available
                if (active && active.style) {
                    activeStyle = active.style;
                }
            }
        } catch (e) {
            // Non-fatal – continue to fallback below.
        }

        // Fallback: if no stored characterDescription, generate one from character data
        // This handles older portraits that don't have characterDescription stored.
        if (!defaultPrompt) {
            if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
                defaultPrompt = AIService.buildCharacterDescription(character);
            } else {
                defaultPrompt = `${character.race}\u0020${character.class}`;
            }
        }
    } catch (e) {
        defaultPrompt = `${character.race}\u0020${character.class}`;
    }
    
    // Populate style dropdown before setting the prompt
    // Use active style from portrait version, or fall back to user's saved preference
    if (!activeStyle) {
        try {
            if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
                activeStyle = StorageService.getPortraitPromptTheme();
            }
        } catch (e) {
            // Non-fatal
        }
    }
    // Await the async dropdown population to ensure API sync completes first
    // This ensures global/shared styles are loaded for all authenticated users
    await populatePortraitStyleDropdown(activeStyle);
    
    document.getElementById('portraitPrompt').value = defaultPrompt;
    const promptModal = document.getElementById('portraitPromptModal');
    if (promptModal) {
        promptModal.classList.add('show');
        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(promptModal);
        }
        // Snapshot form values for dirty checking
        setTimeout(() => ModalManager.snapshotForm('portraitPromptModal'), 50);
    }

    // Populate the quota line (and keep it updated while the modal is open).
    try {
        // Helper to disable/enable modal controls based on quota state
        const updateModalControlsState = (isExhausted) => {
            const promptTextarea = document.getElementById('portraitPrompt');
            const styleTrigger = document.getElementById('portraitStyleTrigger');
            const footerBtns = promptModal?.querySelectorAll('.modal-footer button');
            
            if (promptTextarea) {
                promptTextarea.disabled = isExhausted;
                if (isExhausted) {
                    promptTextarea.placeholder = 'Daily limit reached - come back tomorrow!';
                } else {
                    promptTextarea.placeholder = 'Enter custom description...';
                }
            }
            if (styleTrigger) {
                styleTrigger.disabled = isExhausted;
            }
            if (footerBtns) {
                footerBtns.forEach(btn => {
                    btn.disabled = isExhausted;
                });
            }
        };

        const updateQuotaLine = (detail) => {
            const el = document.getElementById('managerImageQuotaLine');
            if (!el) return;
            const remaining = detail && typeof detail.remaining === 'number' ? detail.remaining : null;
            const limit = detail && typeof detail.limit === 'number' ? detail.limit : null;

            // Update disabled state based on quota
            const isExhausted = remaining === 0;
            updateModalControlsState(isExhausted);

            if (remaining === -1) {
                el.textContent = 'Image quota: unlimited (admin/dev)';
                return;
            }

            if (remaining === 0 && limit != null) {
                el.textContent = 'Custom portraits left today: 0/' + limit;
                return;
            }

            if (remaining != null && limit != null) {
                el.textContent = 'Custom portraits left today: ' + remaining + '/' + limit;
                return;
            }

            el.textContent = 'Image quota: unavailable';
        };

        // Remove any previous handler to avoid duplicates
        if (window._managerQuotaHandler) {
            window.removeEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);
        }
        window._managerQuotaHandler = (e) => updateQuotaLine(e && e.detail);
        window.addEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);

        // Initial fetch
        if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
            const quota = await AIService.getImageQuotaStatus();
            if (quota) {
                updateQuotaLine({ limit: quota.limit, remaining: quota.remaining });
            }
        }
    } catch (e) {
        // Non-fatal
    }
}

function closePortraitPromptModal() {
    // Close the style menu if open (using standard selector toggle)
    const trigger = document.getElementById('portraitStyleTrigger');
    if (trigger && trigger.classList.contains('is-open') && window.CharacterSheet) {
        CharacterSheet.toggleSelectorMenu(trigger);
    }
    
    const modal = document.getElementById('portraitPromptModal');
    if (!modal) {
        const promptInput = document.getElementById('portraitPrompt');
        if (promptInput) promptInput.value = '';
        currentPortraitCharacterId = null;
        currentPortraitStyle = null;
        return;
    }

    const cleanup = () => {
        const promptInput = document.getElementById('portraitPrompt');
        if (promptInput) promptInput.value = '';
        currentPortraitCharacterId = null;
        currentPortraitStyle = null;

        // Remove quota listener (if set)
        try {
            if (window._managerQuotaHandler) {
                window.removeEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);
                window._managerQuotaHandler = null;
            }
        } catch (e) {}
    };

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: cleanup,
    });
}

async function confirmGeneratePortrait() {
    // Defensive check: block if quota is exhausted (in case modal was opened before quota loaded)
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
        );
        closePortraitPromptModal();
        return;
    }

    // Capture the current character ID and style in local variables so they're not lost
    // when we close the modal (which resets currentPortraitCharacterId and currentPortraitStyle to null).
    const portraitCharacterId = currentPortraitCharacterId;
    const selectedStyle = currentPortraitStyle;
    
    if (!portraitCharacterId) {
        closePortraitPromptModal();
        return;
    }

    const character = await CharacterStorage.getById(portraitCharacterId);
    if (!character) {
        closePortraitPromptModal();
        return;
    }

    const customPrompt = document.getElementById('portraitPrompt').value.trim();
    if (!customPrompt) {
        showAlertDialog('Please enter a description for your character portrait.');
        return;
    }

    // Close modal
    closePortraitPromptModal();

    // Show loading state in the portrait area
    const portraitId = `character-portrait-${portraitCharacterId}`;
    const portraitEl = document.getElementById(portraitId);
    const originalPortraitDomId = `original-portrait-${portraitCharacterId}`;
    const originalPortraitEl = document.getElementById(originalPortraitDomId);

    // If the user prefers original images, temporarily switch the visible
    // portrait frame from original → ASCII so they see the cube loader and
    // status text while art is generating. Once the new portrait is ready,
    // we'll switch back to original mode so their preference is respected.
    let shouldRestoreOriginalView = false;
    if (portraitEl && originalPortraitEl) {
        const container = portraitEl.closest('.portrait-container');
        const toggleBtn = document.getElementById(`toggle-portrait-btn-${portraitCharacterId}`);

        // Read the persisted portrait view preference, falling back to config.
        let portraitViewMode = 'original';
        try {
            if (window.StorageService && StorageService.getPortraitViewMode) {
                portraitViewMode = StorageService.getPortraitViewMode();
            } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
            }
        } catch (e) {
            // Non-fatal: keep default
        }

        const isAsciiHidden = portraitEl.classList.contains('is-hidden');
        const isOriginalVisible = !originalPortraitEl.classList.contains('is-hidden');
        const isContainerOriginal =
            !!container && container.classList.contains('portrait-container--original-mode');

        // Only flip the view if:
        // - the global preference is "original"
        // - the DOM is currently showing the original image
        if (portraitViewMode === 'original' && isAsciiHidden && isOriginalVisible && isContainerOriginal) {
            shouldRestoreOriginalView = true;

            // Switch to ASCII view so the loader is visible.
            portraitEl.classList.remove('is-hidden');
            originalPortraitEl.classList.add('is-hidden');
            if (container) {
                container.classList.remove('portrait-container--original-mode');
            }

            // Update the toggle label to match the temporary ASCII view.
            if (toggleBtn) {
                const iconSpan = toggleBtn.querySelector('.selector-option-icon');
                const labelSpan = toggleBtn.querySelector('.selector-option-label');
                if (iconSpan && labelSpan) {
                    iconSpan.textContent = '◉';
                    labelSpan.textContent = 'View Original Art';
                } else {
                    toggleBtn.textContent = '◉ View Original Art';
                }
            }
        }
    }

    let portraitLoadingInterval;
    let portraitElapsed = 0;
    let portraitLoadingActive = true;
    
   const updatePortraitLoading = () => {
       if (!portraitEl || !portraitLoadingActive) return;

       // Single-line status with animated ellipsis and a subtext that reflects the current image model.
       const baseMessage = 'Generating character art';

       // Default subtext assumes DALL·E 3 timing; GPT Image 1 can take longer.
       let subtext = '(This usually takes 20–30 seconds)';
       try {
           let imageModel = 'dall-e-3';
           if (window.StorageService && typeof StorageService.getImageModel === 'function') {
               imageModel = StorageService.getImageModel();
           } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
               imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
           }

           if (imageModel === 'gpt-image-1') {
               subtext = '(This can take up to a minute)';
           }
       } catch (e) {
           // Fall back to default subtext on any error.
       }

       const dotCount = (portraitElapsed % 3) + 1;

       // Use shared cube loader so builder + manager share the same UI and
       // image-model timing hint logic.
       if (
           window.PortraitUI &&
           typeof PortraitUI.renderGeneratingLoader === 'function'
       ) {
           PortraitUI.renderGeneratingLoader(portraitEl, {
               baseMessage,
               subtext,
               dotCount,
               isLoading: true,
           });
       } else {
           // Fallback: inline markup if the shared helper is unavailable.
           let textEl = portraitEl.querySelector('.portrait-placeholder-text');
           if (!textEl) {
               portraitEl.innerHTML = `<div class="portrait-placeholder-content"><div class="portrait-placeholder-cube-container"><div class="portrait-placeholder-cube portrait-placeholder-cube--generating"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="portrait-placeholder-text"data-dots="${dotCount}"><span class="portrait-placeholder-message">${baseMessage}</span><span class="portrait-placeholder-dots"><span class="dot dot-1">.</span><span class="dot dot-2">.</span><span class="dot dot-3">.</span></span><div class="portrait-placeholder-subtext">${subtext}</div></div></div>`;
                textEl = portraitEl.querySelector('.portrait-placeholder-text');
           } else {
               textEl.setAttribute('data-dots', String(dotCount));
               const messageEl = textEl.querySelector('.portrait-placeholder-message');
               if (messageEl) {
                   messageEl.textContent = baseMessage;
               }
           }
       }

       portraitElapsed++;
    };
    
    if (portraitEl) {
        // Add placeholder class for proper cube display with flexbox and 3D context
        portraitEl.classList.add('ascii-portrait--placeholder');
        portraitEl.classList.remove('ascii-portrait--loading');
        portraitEl.style.fontSize = '';
        updatePortraitLoading();
        portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
    }

    console.log('%c🎨 PORTRAIT: Starting AI portrait generation...', 'color: #0ff; font-weight: bold');
    console.log('  Note: DALL-E takes 20-30s when backend is warm, 60s+ on cold start...');

    try {
        // Add rendering instructions to the user's character description
        // Use shared pose + camera data from PortraitPoseData module
        const classKey = (character.class || 'default').toLowerCase();

        const { pose: posePrompt, camera: cameraPrompt } =
            window.PortraitPoseData && typeof PortraitPoseData.getRandomPoseAndCamera === 'function'
                ? PortraitPoseData.getRandomPoseAndCamera(classKey)
                : {
                      pose: 'standing in a relaxed but heroic stance',
                      camera: 'Camera angle: three-quarter view that clearly shows the full silhouette.',
                  };

        let renderingInstructions;
        if (
            typeof window !== 'undefined' &&
            window.PortraitPrompt &&
            typeof window.PortraitPrompt.buildCustomPortraitInstructions ===
                'function'
        ) {
            // Shared helper so builder + manager use the exact same STYLE / Scene
            // logic (including admin-defined prompt styles) for custom prompts.
            // Use the style selected in the modal dropdown (captured before closing).
            const promptThemeId = selectedStyle || null;

            renderingInstructions =
                window.PortraitPrompt.buildCustomPortraitInstructions({
                    posePrompt,
                    cameraPrompt,
                    themeId: promptThemeId,
                });
        } else {
            // Fallback if PortraitPrompt is unavailable.
            // Note: Camera temporarily disabled - may interfere with pose
            renderingInstructions = [
                'Create a high-contrast black-and-white fantasy illustration.',
                'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
                'Include some controlled, directional hatching to define form (light mid-tone texture only).',
                `Pose:${posePrompt}`,
                // cameraPrompt,
                'Background should be simple, entirely black, and free of symbols or text.',
                'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
                'Aspect ratio 3:4.',
            ];
        }
        
        // Combine character description with rendering instructions.
        // Character info comes first, then style/pose/camera instructions.
        // The backend has a 4000 character limit on prompts, so we need to truncate
        // if necessary. Prioritize keeping the character description (customPrompt)
        // and trim style instructions if we exceed the limit.
        const MAX_PROMPT_LENGTH = 3900; // Leave some margin below the 4000 limit
        let fullPrompt = [customPrompt, ...renderingInstructions].join(' ');
        
        if (fullPrompt.length > MAX_PROMPT_LENGTH) {
            console.warn(`Portrait prompt exceeds ${MAX_PROMPT_LENGTH}chars(${fullPrompt.length}),truncating...`);
            // Try to keep the custom prompt intact and reduce style instructions
            const styleInstructionsText = renderingInstructions.join(' ');
            const availableForStyle = MAX_PROMPT_LENGTH - customPrompt.length - 50; // 50 chars buffer
            
            if (availableForStyle > 200) {
                // We have room for some style instructions
                const truncatedStyle = styleInstructionsText.substring(0, availableForStyle);
                fullPrompt = truncatedStyle + ' ' + customPrompt;
            } else {
                // Not much room - just use the custom prompt with minimal style
                const minimalStyle = 'High-contrast black-and-white fantasy ink illustration.';
                fullPrompt = minimalStyle + ' ' + customPrompt.substring(0, MAX_PROMPT_LENGTH - minimalStyle.length - 1);
            }
            console.log(`Truncated prompt length:${fullPrompt.length}`);
        }
        
        // Generate custom portrait with full prompt
        const result = await window.AsciiArtService.generateCustomAIPortraitWithPrompt(fullPrompt);

        // Check if generation actually succeeded
        if (!result || !result.asciiArt || !result.imageUrl) {
            throw new Error('Portrait generation returned incomplete result');
        }

        // Stop the loading animation (guard against any final timer ticks)
        portraitLoadingActive = false;
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }

        console.log('%c🎨 PORTRAIT (Success) ✨', 'color: #0f0; font-weight: bold');

        // Update character in storage and append a new portrait version
        const currentCount = character.customPortraitCount || 0;

        console.log('%c🎨 PORTRAIT HISTORY CHECK', 'color: #0ff; font-weight: bold');
        console.log('  window.PortraitHistory exists:', !!window.PortraitHistory);
        console.log('  addVersion is function:', typeof window.PortraitHistory?.addVersion === 'function');

        // Use the style selected in the modal dropdown for tagging
        const managerStyle = selectedStyle || null;

        let updatedMetadata;
        if (window.PortraitHistory && typeof window.PortraitHistory.addVersion === 'function') {
            const existingMetadata = character.portraitMetadata || {};
            const existingVersions = Array.isArray(existingMetadata.versions)
                ? existingMetadata.versions
                : [];

            let baseCharacterForHistory = character;

            // If this character already has a portrait but no version history yet,
            // seed the history with the *current* portrait before we overwrite it.
            if (existingVersions.length === 0) {
                const priorAscii =
                    character.customPortraitAscii ||
                    character.asciiPortrait ||
                    character.portrait?.ascii ||
                    '';
                const priorUrl =
                    character.originalPortraitUrl ||
                    character.portrait?.url ||
                    null;

                if (priorAscii || priorUrl) {
                    const seededMetadata = window.PortraitHistory.addVersion(
                        character,
                        priorAscii,
                        priorUrl,
                        {
                            source: 'original-ai',
                            prompt: null,
                            style: null,
                        },
                    );

                    baseCharacterForHistory = {
                        ...character,
                        portraitMetadata: seededMetadata,
                    };
                }
            }

            // Capture the model and quality that were used for generation
            let generationModel = 'dall-e-3';
            let generationQuality = null;
            try {
                if (window.StorageService && typeof StorageService.getImageModel === 'function') {
                    generationModel = StorageService.getImageModel();
                } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
                    generationModel = CONFIG.DEFAULT_IMAGE_MODEL;
                }
                if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
                    generationQuality = StorageService.getImageQuality(generationModel);
                }
            } catch (e) {
                // Non-fatal: use defaults
            }

            updatedMetadata = window.PortraitHistory.addVersion(
                baseCharacterForHistory,
                result.asciiArt,
                result.imageUrl,
                {
                    source: 'custom-ai',
                    prompt: fullPrompt,
                    characterDescription: customPrompt,
                    style: managerStyle,
                    model: generationModel,
                    quality: generationQuality,
                },
            );
            console.log('%c🎨 PORTRAIT HISTORY UPDATED', 'color: #0f0; font-weight: bold');
            console.log('  Versions count:', updatedMetadata.versions?.length || 0);
            console.log('  Active version:', updatedMetadata.activeVersionId);
        } else {
            console.log('%c⚠️ PORTRAIT HISTORY NOT AVAILABLE!', 'color: #f00; font-weight: bold');
            console.log('  Using fallback - no versions will be saved');
            updatedMetadata = character.portraitMetadata || {};
        }

        const updates = {
            originalPortraitUrl: result.imageUrl,
            customPortraitAscii: result.asciiArt,
            customPortraitCount: currentCount + 1,
            portraitMetadata: updatedMetadata,
            // Keep portrait object in sync for manager sheet rendering
            portrait: {
                ...(character.portrait || {}),
                url: result.imageUrl,
                ascii: result.asciiArt,
            },
        };

        // Persist to storage (cloud or local depending on auth state)
        await CharacterStorage.update(portraitCharacterId, updates);
        markUserChanges(); // Show guest notice if applicable

        // Apply the new portrait directly into the currently visible manager UI
        // so we avoid a full grid/sheet re-render and instead "draw in" the art.
        try {
            const portraitArt = result.asciiArt;
            const portraitDomId = `character-portrait-${portraitCharacterId}`;
            const originalPortraitDomId = `original-portrait-${portraitCharacterId}`;
            const asciiEl = document.getElementById(portraitDomId);
            const imgEl = document.getElementById(originalPortraitDomId);

            // If we temporarily switched from original → ASCII to show the
            // loader, restore the original image view now that the new art
            // is ready. Skip the ASCII animation when in original mode.
            if (shouldRestoreOriginalView && asciiEl && imgEl) {
                const container = asciiEl.closest('.portrait-container');
                const toggleBtn = document.getElementById(`toggle-portrait-btn-${portraitCharacterId}`);

                // Store the ASCII art in the element without animation so it's
                // available if user toggles to ASCII view later.
                if (portraitArt) {
                    if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
                        CharacterSheet.setPortraitContent(asciiEl, portraitArt);
                    } else {
                        asciiEl.innerHTML = '';
                        const pre = document.createElement('pre');
                        pre.textContent = portraitArt;
                        asciiEl.appendChild(pre);
                    }
                    // Remove loading/placeholder classes since content is now set
                    asciiEl.classList.remove('ascii-portrait--placeholder', 'ascii-portrait--loading');
                }

                // Restore original image view with reveal animation
                asciiEl.classList.add('is-hidden');
                imgEl.classList.remove('is-hidden', 'is-loaded', 'portrait-reveal');
                if (container) {
                    container.classList.add('portrait-container--original-mode');
                }

                // Set image src and trigger reveal animation when it loads
                imgEl.onload = function() {
                    this.classList.add('is-loaded', 'portrait-reveal');
                    // Clean up the reveal class after animation completes
                    this.addEventListener('animationend', () => {
                        this.classList.remove('portrait-reveal');
                    }, { once: true });
                };
                imgEl.src = result.imageUrl;

                if (toggleBtn) {
                    const iconSpan = toggleBtn.querySelector('.selector-option-icon');
                    const labelSpan = toggleBtn.querySelector('.selector-option-label');
                    if (iconSpan && labelSpan) {
                        iconSpan.textContent = '≡';
                        labelSpan.textContent = 'View ASCII Art';
                    } else {
                        toggleBtn.textContent = '≡ View ASCII Art';
                    }
                }
            } else {
                // Update original image src so it's ready if user toggles view
                if (imgEl && result.imageUrl) {
                    imgEl.src = result.imageUrl;
                }
                // In ASCII mode: animate the ASCII portrait into place, mirroring
                // the builder's typewriter-style reveal so it feels consistent.
                if (asciiEl && portraitArt) {
                    await typeManagerPortrait(asciiEl, portraitArt);
                }
            }

            // Also update the character card thumbnail (if it exists) so the
            // grid immediately reflects the newly generated portrait.
            // Respect the user's portrait view mode preference (original vs ASCII).
            const thumbEl = document.getElementById(`card-thumb-${portraitCharacterId}`);
            if (thumbEl) {
                try {
                    // Check the user's portrait view mode preference
                    let thumbViewMode = 'original';
                    try {
                        if (window.StorageService && StorageService.getPortraitViewMode) {
                            thumbViewMode = StorageService.getPortraitViewMode();
                        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                            thumbViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
                        }
                    } catch (e) {
                        // Non-fatal: keep default
                    }

                    const showOriginalImage = thumbViewMode === 'original' && !!result.imageUrl;

                    if (showOriginalImage) {
                        // Update to show the original image
                        let thumbImgEl = thumbEl.querySelector('img');
                        if (thumbImgEl) {
                            // Just update the src
                            thumbImgEl.src = result.imageUrl;
                        } else {
                            // Need to switch from ASCII to image mode
                            thumbEl.innerHTML = '';
                            thumbEl.classList.add('card-thumbnail--image');
                            thumbImgEl = document.createElement('img');
                            thumbImgEl.src = result.imageUrl;
                            thumbImgEl.alt = 'Character portrait';
                            thumbImgEl.loading = 'lazy';
                            thumbImgEl.onload = function() { this.classList.add('is-loaded'); };
                            thumbEl.appendChild(thumbImgEl);
                        }
                    } else if (portraitArt) {
                        // Update to show ASCII art
                        let croppedArt;
                        if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                            croppedArt = UI.cropAsciiForThumbnail(portraitArt);
                        } else {
                            const lines = portraitArt.split('\n');
                            const topLines = lines
                                .slice(0, 80)
                                .map(line => line.slice(0, 160));
                            croppedArt = topLines.join('\n');
                        }
                        // Remove image mode class if present
                        thumbEl.classList.remove('card-thumbnail--image');
                        // Use <pre> wrapper for proper CSS flex centering
                        thumbEl.innerHTML = '';
                        const pre = document.createElement('pre');
                        pre.textContent = croppedArt;
                        thumbEl.appendChild(pre);
                    }
                } catch (thumbError) {
                    console.error('Portrait thumbnail update failed', thumbError);
                }
            }
        } catch (applyError) {
            console.error('Error applying new custom portrait to manager UI', applyError);
        }

        // Keep AppState in sync for any future renders/navigations so that if
        // the grid or sheet re-renders later, it uses this new portrait.
        // Use String() comparison to handle type mismatches (cloud IDs may be
        // numeric, but portraitCharacterId from onclick is always a string).
        try {
            const nextCharacter = { ...character, ...updates };
            const idStr = String(portraitCharacterId);

            // Debug: Log the character state being applied
            if (window.DEBUG_PORTRAITS) {
                console.log(`🖼️[PORTRAIT DEBUG]After generation-updating AppState`, {
                    characterId: idStr,
                    characterName: nextCharacter.name,
                    newPortraitUrl: updates.originalPortraitUrl,
                    newActiveVersionId: updates.portraitMetadata?.activeVersionId,
                    hasCustomPortraitAscii: !!updates.customPortraitAscii,
                    timestamp: new Date().toISOString()
                });
            }

            // Update AppState arrays directly (avoid window.AppState check which
            // could reference a different object due to module scoping)
            if (Array.isArray(AppState.characters)) {
                const idx = AppState.characters.findIndex(
                    c => c && String(c.id) === idStr,
                );
                if (idx !== -1) {
                    AppState.characters[idx] = nextCharacter;
                }
            }
            if (Array.isArray(AppState.filteredCharacters)) {
                const fIdx = AppState.filteredCharacters.findIndex(
                    c => c && String(c.id) === idStr,
                );
                if (fIdx !== -1) {
                    AppState.filteredCharacters[fIdx] = nextCharacter;
                }
            }

            // Debug: Verify the AppState update
            if (window.DEBUG_PORTRAITS) {
                const verifyChar = AppState.characters.find(c => c && String(c.id) === idStr);
                console.log(`🖼️[PORTRAIT DEBUG]AppState AFTER in-place update`, {
                    characterId: idStr,
                    portraitUrl: verifyChar?.originalPortraitUrl,
                    activeVersionId: verifyChar?.portraitMetadata?.activeVersionId,
                    hasCustomPortraitAscii: !!verifyChar?.customPortraitAscii,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (stateError) {
            console.error('Error syncing AppState after portrait generation', stateError);
        }

        // Re-sort and re-render the grid WITHOUT reloading from storage.
        // Previously we called `await AppState.loadCharacters()` here, but that
        // could return stale data from storage/cloud if the write hadn't fully
        // propagated, causing portrait mismatches when switching characters.
        // Since we already updated AppState.characters in-place above, we just
        // need to re-apply filters (which handles sorting) and re-render.
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️[PORTRAIT DEBUG]Re-sorting grid(no storage reload)`, {
                characterId: portraitCharacterId,
                timestamp: new Date().toISOString()
            });
        }

        // Update the character's updatedAt timestamp so it sorts correctly in "date modified" mode
        const idStr = String(portraitCharacterId);
        const charInState = AppState.characters.find(c => c && String(c.id) === idStr);
        if (charInState) {
            charInState.updatedAt = new Date().toISOString();
            // Also update in filteredCharacters if present
            const filteredChar = AppState.filteredCharacters.find(c => c && String(c.id) === idStr);
            if (filteredChar) {
                filteredChar.updatedAt = charInState.updatedAt;
            }
        }

        // Re-apply filters (handles sorting) and re-render
        AppState.applyFilters();
        UI.render();

        // Debug: Verify the character data is still correct after re-render
        if (window.DEBUG_PORTRAITS) {
            const charAfterRender = AppState.characters.find(c => c && String(c.id) === idStr);
            console.log(`🖼️[PORTRAIT DEBUG]AppState AFTER re-render(no reload)`, {
                characterId: idStr,
                portraitUrl: charAfterRender?.originalPortraitUrl,
                activeVersionId: charAfterRender?.portraitMetadata?.activeVersionId,
                hasCustomPortraitAscii: !!charAfterRender?.customPortraitAscii,
                versionsCount: charAfterRender?.portraitMetadata?.versions?.length || 0,
                timestamp: new Date().toISOString()
            });
        }

        // Notify the user that the portrait was generated successfully.
        // Previously this message included a "3 remaining" counter, which
        // implied a hard limit on custom portraits per character. That limit
        // has been removed, so we no longer show a remaining count here.
        showNotification('Custom portrait generated!');

        // Clear the global pointer once we're done
        currentPortraitCharacterId = null;
    } catch (error) {
        console.error('Error generating custom AI portrait:', error);
        
        // Stop the loading animation
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }
        // Restore portrait font size and remove placeholder class on error as well
        if (portraitEl) {
            portraitEl.style.fontSize = '';
            portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
        }
        
        // Restore previous portrait first
        if (portraitEl) {
            const asciiPortrait = window.CharacterSheet.getAsciiPortrait(character);
            if (asciiPortrait && window.CharacterSheet) {
                CharacterSheet.setPortraitContent(portraitEl, asciiPortrait);
            } else if (window.CharacterSheet) {
                CharacterSheet.setPortraitContent(portraitEl, '[ NO PORTRAIT ]');
            }
        }
        
        // Graceful error handling - inform but don't block
        if (error.isSafetyRejection) {
            console.log('%c🎨 PORTRAIT (Safety System Rejection)', 'color: #fa0; font-weight: bold');
            console.log('  OpenAI flagged this request:', error.originalMessage || error.message);
            showNotification('⚠️ OpenAI flagged this portrait request. Try modifying your character description or prompt.');
        } else if (error.isRateLimit) {
            console.log('%c🎨 PORTRAIT (Rate Limited)', 'color: #fa0; font-weight: bold');
            showNotification('⚠️ Rate limit exceeded. Please wait a few minutes before trying again.');
        } else if (error.name === 'AbortError' || (error.message && error.message.includes('timed out'))) {
            console.log('%c🎨 PORTRAIT (Timeout - Backend Waking Up)', 'color: #fa0; font-weight: bold');
            console.log('  ⏰ Request timed out. Backend may be waking up from cold start.');
            console.log('  ✅ Try again in a moment - server should be warm now!');
            showNotification('⏰ Request timed out. Backend may be waking up. Try again in a moment!');
            
            // Trigger background warmup like other AI features
            if (window.AIService && window.AIService.warmupBackend) {
                window.AIService.warmupBackend();
            }
        } else if (error.message && error.message.includes('fetch')) {
            console.log('%c🎨 PORTRAIT (Connection Error)', 'color: #f00; font-weight: bold');
            console.log('  Cannot connect to backend server');
            showNotification('🔌 Cannot connect to backend server. Check that it\'s running.');
        } else {
            console.log('%c🎨 PORTRAIT (Failed)', 'color: #f00; font-weight: bold');
            console.log('  Error:', error.message);
            showNotification('❌ Portrait generation failed. Check console for details and try again.');
        }
    }
}

async function surpriseMePortrait() {
    // Defensive check: block if quota is exhausted
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
        );
        closePortraitPromptModal();
        return;
    }

    const portraitCharacterId = currentPortraitCharacterId;
    if (!portraitCharacterId) {
        closePortraitPromptModal();
        return;
    }

    const character = await CharacterStorage.getById(portraitCharacterId);
    if (!character) {
        closePortraitPromptModal();
        return;
    }

    // Build a fresh randomized character description for the user to edit.
    // NOTE: Use buildCharacterDescription (not buildPortraitPrompt) so that
    // rendering instructions (Pose/Camera/STYLE/Scene) are only added once
    // by confirmGeneratePortrait, avoiding duplication in the final prompt.
    let templatePrompt = '';
    try {
        if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
            templatePrompt = AIService.buildCharacterDescription(character);
        } else {
            templatePrompt = `${character.race}\u0020${character.class}`;
        }
    } catch (e) {
        templatePrompt = `${character.race}\u0020${character.class}`;
    }

    const promptInput = document.getElementById('portraitPrompt');
    if (promptInput) {
        promptInput.value = templatePrompt;
    }

    // Reuse the existing generation pipeline.
    await confirmGeneratePortrait();
}

// Animate ASCII portrait character-by-character, line-by-line in the manager
// sheet, mirroring the builder's quick-create behavior but scoped to the
// manager DOM. This keeps the "new art fades in" feel without reloading.
async function typeManagerPortrait(element, portraitText) {
    if (!element || !portraitText) return;

    // Normalize the portrait container back to the base ASCII frame in case
    // any loader/placeholder styles are still hanging around.
    element.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
    element.style.fontSize = '';
    element.style.whiteSpace = '';
    element.style.textAlign = '';
    element.style.overflowX = '';
    element.style.overflowY = '';

    const lines = portraitText.split('\n');
    // Use a <pre> child element for proper CSS flex centering
    element.innerHTML = '';
    const pre = document.createElement('pre');
    element.appendChild(pre);

    let currentText = '';
    const charsPerFrame = 40; // Batch multiple characters per frame for speed
    let charCount = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            currentText += line[charIndex];
            charCount++;

            if (charCount >= charsPerFrame) {
                pre.textContent = currentText;
                charCount = 0;
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        if (lineIndex < lines.length - 1) {
            currentText += '\n';
        }
    }

    // Final flush to ensure all text is visible
    pre.textContent = currentText;
}

// Panel loading cubes are now defined directly in index.html using
// portrait-style cube markup (larger, simpler Y-axis rotation).

// ===== PORTRAIT HISTORY (MANAGER) =====
// The full portrait history UI is now handled by the shared PortraitUI
// module (portraits-ui.js). Keep this wrapper for backwards compatibility
// with any code that still calls openPortraitHistory(characterId) directly.
async function openPortraitHistory(characterId) {
    if (window.PortraitUI && typeof window.PortraitUI.openManagerHistory === 'function') {
        return window.PortraitUI.openManagerHistory(characterId);
    }
}

async function duplicateCharacter(id) {
    showConfirmDialog('Create a copy of this character?', async () => {
        const duplicate = await CharacterStorage.duplicate(id);
        if (duplicate) {
            await AppState.loadCharacters();
            UI.render();
            showNotification(`Created:${duplicate.name}`);
        }
    });
}

async function exportCharacter(id) {
    const json = await CharacterStorage.export(id);
    if (json) {
        const character = await CharacterStorage.getById(id);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${character.name||'character'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Character exported!');
    }
}

async function deleteCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    // On mobile, close the sheet view first before showing the confirmation dialog.
    // This returns the user to the grid so they see the context of what they're deleting.
    if (typeof MobileView !== 'undefined' && MobileView.isMobile() && MobileView.isOpen()) {
        MobileView.close();
    }

    showConfirmDialog(`Delete ${character.name}?\n\nThis cannot be undone.`, async () => {
        await CharacterStorage.delete(id);
        await AppState.loadCharacters();
        UI.render();
        showNotification('Character deleted');
    });
}

let isImporting = false;  // Flag to prevent concurrent imports

// Helper: get the primary action button inside the Import modal only.
// This avoids accidentally targeting primary buttons from other modals.
function getImportModalPrimaryButton() {
    const importModal = document.getElementById('importModal');
    return importModal
        ? importModal.querySelector('.modal-footer .terminal-btn-primary')
        : null;
}

function showImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) {
        modal.classList.add('show');

        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(modal);
        }

        // Disable import button until file is selected
        const importButton = modal.querySelector('.modal-footer .terminal-btn-primary');
        if (importButton) {
            importButton.disabled = true;
        }
    }
}

function closeImportModal() {
    console.log('🚪 closeImportModal() called, isImporting was:', isImporting);
    const modal = document.getElementById('importModal');
    if (!modal) {
        isImporting = false;
        return;
    }

    const cleanup = () => {
        const fileInput = document.getElementById('importFile');
        const fileName = document.getElementById('fileName');
        if (fileInput) fileInput.value = '';
        if (fileName) fileName.textContent = '';

        // Re-enable the import button and reset text
        const importButton = getImportModalPrimaryButton();
        if (importButton) {
            importButton.disabled = true;  // Disable for next time modal opens
            importButton.textContent = 'IMPORT';
        }

        isImporting = false;  // Reset flag when closing
        console.log('🚪 closeImportModal() done, isImporting now:', isImporting);
    };

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: cleanup,
    });
}

// Store duplicate resolution data temporarily
let pendingDuplicateResolution = null;

function showDuplicateResolutionModal(characterName, existingId, importData) {
    console.log('⚠️ DUPLICATE MODAL: Showing resolution options for', characterName);
    
    // Store the data for resolution
    pendingDuplicateResolution = {
        characterName,
        existingId,
        importData
    };
    
    // Update modal content
    document.getElementById('duplicateCharName').textContent = characterName;
    
    // Close import modal and show duplicate modal
    document.getElementById('importModal').classList.remove('show');
    const duplicateModal = document.getElementById('duplicateModal');
    if (duplicateModal) {
        duplicateModal.classList.add('show');
        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(duplicateModal);
        }
    }
}

function closeDuplicateModal() {
    console.log('🚪 DUPLICATE MODAL: Closing');
    const modal = document.getElementById('duplicateModal');
    if (!modal) {
        pendingDuplicateResolution = null;
        isImporting = false;
        return;
    }

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: () => {
            pendingDuplicateResolution = null;
            isImporting = false;  // Reset flag
        },
    });
}

function saveDuplicateResolution() {
    const selectedRadio = document.querySelector('input[name="duplicateAction"]:checked');
    if (!selectedRadio) {
        console.error('No duplicate action selected!');
        return;
    }
    resolveDuplicate(selectedRadio.value);
}

function resolveDuplicate(action) {
    if (!pendingDuplicateResolution) {
        console.error('No pending duplicate resolution!');
        return;
    }
    
    const { existingId, importData } = pendingDuplicateResolution;
    
    console.log('🔧 DUPLICATE RESOLUTION: Action =', action);
    
    if (action === 'overwrite') {
        handleOverwriteCharacter(existingId, importData);
    } else if (action === 'keep-both') {
        handleKeepBothCharacters(importData);
    }
    
    // Close modal and cleanup
    closeDuplicateModal();
}

async function handleOverwriteCharacter(existingId, importData) {
    console.log('🔄 OVERWRITE: Replacing existing character with ID:', existingId);
    
    // Delete the existing character
    await CharacterStorage.delete(existingId);
    
    // Import the new one (bypassing duplicate check but preserving stable UID)
    const character = JSON.parse(importData);
    delete character.id;
    
    // Preserve stable UID on overwrite so future exports/imports still match
    const importedUid =
        character.metadata?.characterUid ||
        character.characterUid ||
        null;
    if (importedUid) {
        if (!character.metadata) character.metadata = {};
        character.metadata.characterUid = importedUid;
        character.characterUid = importedUid;
    }

    const result = await CharacterStorage.add(character);
    markUserChanges(); // Show guest notice if applicable
    
    if (result) {
        console.log('✅ KEEP BOTH SUCCESS: Character imported as', newName);
        await AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Replaced:${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

async function handleKeepBothCharacters(importData) {
    console.log('📋 KEEP BOTH: Importing with modified name');
    
    // Parse and modify the character name
    const character = JSON.parse(importData);
    const originalName = character.name;
    
    // Find a unique name by adding (Copy N)
    const existing = await CharacterStorage.getAll();
    let copyNumber = 1;
    let newName = `${originalName}(Copy)`;
    
    while (existing.some(c => c.name === newName)) {
        copyNumber++;
        newName = `${originalName}(Copy ${copyNumber})`;
    }
    
    character.name = newName;
    
    // For "keep both", treat this as a new logical character: give it a new UID
    const newUid = `danddy_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    if (!character.metadata) character.metadata = {};
    character.metadata.characterUid = newUid;
    character.characterUid = newUid;
    delete character.id;
    
    const result = await CharacterStorage.add(character);
    markUserChanges(); // Show guest notice if applicable
    
    if (result) {
        console.log('✅ KEEP BOTH SUCCESS: Character imported as', newName);
        await AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Imported as:${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

async function importCharacter() {
    console.log('🔵 importCharacter() called, isImporting =', isImporting);
    
    // Prevent concurrent imports
    if (isImporting) {
        console.log('⚠️ Import already in progress, blocking duplicate call');
        return;
    }
    
    // Set flag IMMEDIATELY to prevent race condition
    isImporting = true;
    console.log('🔒 Import locked, isImporting =', isImporting);
    
    // Disable the import button immediately
    const importButton = getImportModalPrimaryButton();
    if (importButton) {
        importButton.disabled = true;
        importButton.textContent = 'IMPORTING...';
    }
    
    const fileInput = document.getElementById('importFile');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        console.log('📂 FILE: Selected file:', file.name, 'Size:', file.size);
        const reader = new FileReader();
        console.log('📖 READER: Created new FileReader');
        reader.onload = async (e) => {
            console.log('📖 READER.ONLOAD: Callback triggered, isImporting =', isImporting);
            const importData = e.target.result;
            const result = await CharacterStorage.import(importData);
            
            // Check if it's a duplicate
            if (result && result.isDuplicate) {
                console.warn('⚠️ DUPLICATE: Character already exists');
                
                // Show duplicate resolution modal instead of simple alert
                showDuplicateResolutionModal(result.name, result.existingIds[0], importData);
                
                // Re-enable button
                const importButton = getImportModalPrimaryButton();
                if (importButton) {
                    importButton.disabled = false;
                    importButton.textContent = 'IMPORT';
                }
                isImporting = false;  // Reset flag
                return;
            }
            
            if (result) {
                console.log('✅ SUCCESS: Character imported, calling loadCharacters()');
                await AppState.loadCharacters();
                console.log('🎨 RENDER: Calling UI.render()');
                UI.render();
                console.log('🚪 MODAL: Calling closeImportModal()');
                closeImportModal();
                showNotification(`Imported:${result.name}`);
                // Auto-select the imported character
                setTimeout(() => viewCharacter(result.id), 100);
            } else {
                showAlertDialog('Invalid character file!');
                // Re-enable button on error
                const importButton = getImportModalPrimaryButton();
                if (importButton) {
                    importButton.disabled = false;
                    importButton.textContent = 'IMPORT';
                }
                isImporting = false;  // Reset on error
            }
        };
        reader.onerror = () => {
            showAlertDialog('Error reading file!');
            // Re-enable button on error
            const importButton = getImportModalPrimaryButton();
            if (importButton) {
                importButton.disabled = false;
                importButton.textContent = 'IMPORT';
            }
            isImporting = false;  // Reset on error
        };
        console.log('📖 READER: Starting readAsText()');
        reader.readAsText(file);
    } else {
        showAlertDialog('Please select a file to import.');
        // Re-enable button and reset flag
        const importButton = getImportModalPrimaryButton();
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = 'IMPORT';
        }
        isImporting = false;  // Reset flag
    }
}

function togglePortraitView(characterId) {
    const asciiPortrait = document.getElementById(`character-portrait-${characterId}`);
    const originalPortrait = document.getElementById(`original-portrait-${characterId}`);
    const toggleBtn = document.getElementById(`toggle-portrait-btn-${characterId}`);
    const container = asciiPortrait
        ? asciiPortrait.closest('.portrait-container')
        : null;

    if (!asciiPortrait || !originalPortrait || !toggleBtn) {
        console.warn('Portrait elements not found for character:', characterId);
        return;
    }

    const isShowingAscii = !asciiPortrait.classList.contains('is-hidden');

    const iconSpan = toggleBtn.querySelector('.selector-option-icon');
    const labelSpan = toggleBtn.querySelector('.selector-option-label');

    if (isShowingAscii) {
        // Switch to original
        asciiPortrait.classList.add('is-hidden');
        originalPortrait.classList.remove('is-hidden');
        if (container) {
            container.classList.add('portrait-container--original-mode');
        }

        if (iconSpan && labelSpan) {
            iconSpan.textContent = '≡';
            labelSpan.textContent = 'View ASCII Art';
        } else {
            toggleBtn.textContent = '≡ View ASCII Art';
        }

        toggleBtn.title = 'Toggle between ASCII and original art';
    } else {
        // Switch to ASCII
        asciiPortrait.classList.remove('is-hidden');
        originalPortrait.classList.add('is-hidden');
        if (container) {
            container.classList.remove('portrait-container--original-mode');
        }

        if (iconSpan && labelSpan) {
            iconSpan.textContent = '◉';
            labelSpan.textContent = 'View Original Art';
        } else {
            toggleBtn.textContent = '◉ View Original Art';
        }

        toggleBtn.title = 'Toggle between ASCII and original art';
    }
}

function showNotification(rawMessage, duration = 4000) {
    // Normalize to string so callers can safely pass anything.
    const message = (rawMessage == null) ? '' : String(rawMessage);

    // Console notification with visual styling (preserve any glyphs for logs)
    console.log('%c✓ ' + message, 'color: #0f0; font-weight: bold');

    // Strip leading glyphs (checkmarks, warning icons, etc.) from the toast text
    // while keeping them available in logs. This keeps toasts purely textual
    // with the exception of the "×" close button. Also trim leading/trailing
    // whitespace so any stray spaces from callers are cleaned up.
    const cleanedMessage = message
        .replace(
            /^[\s\u200b]*(?:[✓✔✕✖✗★⚠💡❌⏰🔌]+[\s\u00a0\u200b]*)+/u,
            ''
        )
        .trim();

    // Normalize overly-emphatic punctuation so toast messages stay calm and
    // readable. We keep question marks intact but strip trailing exclamation
    // marks (including "!!" etc.) which tend to feel shouty in short toasts.
    const displayMessage = cleanedMessage
        // Collapse any run of exclamation marks to a single one
        .replace(/!{2,}/g, '!')
        // Remove a trailing exclamation mark (or run of them) while preserving
        // any final period or closing paren that may follow.
        .replace(/!+(\s*[\.\)])?$/u, '$1')
        .trim();

    // Toast notification shared across the app (anchored to the terminal frame)
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        // Inner structure: message + dismiss "X" pinned to the right in its own wrapper
        toast.innerHTML = `<span class="toast-message"></span><div class="toast-dismiss-wrapper"><button type="button"class="toast-dismiss"aria-label="Dismiss notification"><span class="toast-dismiss-icon">&times;</span></button></div>`;

        const container = document.querySelector('.terminal-frame') || document.body;
        container.appendChild(toast);

        const dismissBtn = toast.querySelector('.toast-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                toast.classList.remove('show');
                // Clear any pending show/hide timers
                if (window._toastShowTimeout) {
                    clearTimeout(window._toastShowTimeout);
                    window._toastShowTimeout = null;
                }
                if (window._toastTimeout) {
                    clearTimeout(window._toastTimeout);
                    window._toastTimeout = null;
                }
            });
        }
    }

    const messageEl = toast.querySelector('.toast-message');
    if (messageEl) {
        messageEl.textContent = displayMessage;
    } else {
        // Fallback in case markup is missing for any reason
        toast.textContent = displayMessage;
    }

    // Reset any in-flight timers so we can replay the entrance animation
    if (window._toastShowTimeout) {
        clearTimeout(window._toastShowTimeout);
        window._toastShowTimeout = null;
    }
    if (window._toastTimeout) {
        clearTimeout(window._toastTimeout);
        window._toastTimeout = null;
    }

    // Ensure we start from the hidden state so the transition always plays,
    // even immediately after a page reload.
    toast.classList.remove('show');
    // Force a reflow so the browser acknowledges the hidden state
    // before we add the "show" class.
    void toast.offsetWidth; // eslint-disable-line no-unused-expressions

    window._toastShowTimeout = setTimeout(() => {
        toast.classList.add('show');
        window._toastShowTimeout = null;

        // Auto-dismiss after specified duration (default 4s for success messages)
        window._toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            window._toastTimeout = null;
        }, duration);
    }, 80);
}

// Focus the first meaningful field inside a modal (inputs/textareas/selects first, then primary button).
function focusFirstFieldInModal(modal) {
    if (!modal || typeof modal.querySelector !== 'function') return;

    const fieldSelectors = [
        // High-priority: styled terminal inputs
        'input.terminal-input:not([type="hidden"]):not(.file-input-hidden):not([disabled])',
        'textarea.terminal-input:not([disabled])',
        'textarea.terminal-textarea:not([disabled])',
        'select.terminal-select:not([disabled])',
        // Generic fallbacks
        'input:not([type="hidden"]):not(.file-input-hidden):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
    ];

    let target = null;
    for (const selector of fieldSelectors) {
        target = modal.querySelector(selector);
        if (target) break;
    }

    if (!target) {
        const fallbackSelectors = [
            '.modal-footer .terminal-btn-primary:not([disabled])',
            '.modal-footer button:not([disabled])',
            'button.terminal-btn-primary:not([disabled])',
            'button:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ];
        for (const selector of fallbackSelectors) {
            target = modal.querySelector(selector);
            if (target) break;
        }
    }

    if (target && typeof target.focus === 'function') {
        // Defer slightly to ensure any CSS animations / layout are ready.
        // We intentionally do NOT auto-select the text; we only move focus.
        setTimeout(() => {
            try {
                target.focus();
            } catch (e) {
                // Non-fatal
            }
        }, 0);
    }
}

// Manager now uses the shared SettingsModal defined in character-builder-components.js

// Generic helper: animate modal close so it shrinks toward center instead of
// disappearing instantly. Expects terminal-theme.css modal keyframes.
/**
 * @param {HTMLElement} modal
 * @param {{ removeOnClose?: boolean, onClosed?: () => void }} options
 */
function animateModalClose(modal, options = {}) {
    if (!modal) return;

    const { removeOnClose = false, onClosed } = options;

    // Avoid double-closing the same modal.
    if (modal.classList.contains('closing')) {
        return;
    }

    // Keep .show so layout stays active while the close animation runs.
    modal.classList.add('closing');

    const content = modal.querySelector('.modal-content') || modal;

    let finished = false;
    const finish = () => {
        // Prevent double-execution from both animationend and fallback timeout
        if (finished) return;
        finished = true;

        if (removeOnClose) {
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        } else {
            modal.classList.remove('show');
            modal.classList.remove('closing');
        }

        if (typeof onClosed === 'function') {
            onClosed();
        }
    };

    if (content && typeof content.addEventListener === 'function') {
        content.addEventListener('animationend', finish, { once: true });
        // Fallback timeout in case animationend doesn't fire
        // (e.g., animation was already running or browser quirk)
        setTimeout(finish, 400);
    } else {
        finish();
    }
}

// Helper hooks so inline onclick handlers can use the shared animator.
function closeGenericConfirmModal() {
    const modal = document.getElementById('genericConfirmModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

function closeGenericAlertModal() {
    const modal = document.getElementById('genericAlertModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

/**
 * Close all editor/character-related modals.
 * Called during logout and login to ensure a clean state.
 */
function closeAllEditorModals() {
    // List of modal IDs that should be closed on auth state changes
    const modalIds = [
        'editDetailsModal',
        'portraitPromptModal',
        'importModal',
        'duplicateModal',
        'renameModal',
        'shareModal',
        'pendingSharesModal',
        'genericConfirmModal',
        'genericAlertModal',
        'sessionExpiredModal',
    ];
    
    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal && modal.classList.contains('show')) {
            // Force immediate close without animation to avoid race conditions
            modal.classList.remove('show', 'closing');
        }
    });
    
    // Also restore the editDetailsModal content to its original state
    // in case it was showing the level change dialog
    const editModal = document.getElementById('editDetailsModal');
    if (editModal && originalEditModalContent) {
        const modalContent = editModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = originalEditModalContent;
        }
    }
    
    // Clear any editing state
    currentEditCharacterId = null;
    originalEditLevel = null;
}

// Generic confirmation modal using terminal modal styles
function showConfirmDialog(message, onConfirm) {
    const existing = document.getElementById('genericConfirmModal');
    if (existing) existing.remove();

    const escapedMessage = Utils.escapeHtml(message).replace(/\n/g, '<br>');
    const modalHtml = `<div id="genericConfirmModal"class="modal show"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">CONFIRM</h2><button class="modal-close"onclick="closeGenericConfirmModal()">&times;</button></div><div class="modal-body"><p class="terminal-text">${escapedMessage}</p></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"id="genericConfirmCancel">CANCEL</button><button class="terminal-btn terminal-btn-primary"id="genericConfirmOk">OK</button></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericConfirmModal');
    const cancelBtn = document.getElementById('genericConfirmCancel');
    const okBtn = document.getElementById('genericConfirmOk');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', async () => {
        close();
        if (onConfirm) {
            await onConfirm();
        }
    });

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// Helper to animate modal content transition with height change
function animateModalContentSwap(modalContent, newHtml, onComplete) {
    const startHeight = modalContent.offsetHeight;
    
    // Phase 1: Fade out current content
    modalContent.style.overflow = 'hidden';
    modalContent.style.height = startHeight + 'px';
    modalContent.style.transition = 'opacity 0.15s ease-out';
    modalContent.style.opacity = '0';
    
    setTimeout(() => {
        // Swap content
        modalContent.innerHTML = newHtml;
        
        // Measure new height (temporarily set to auto)
        modalContent.style.height = 'auto';
        const endHeight = modalContent.offsetHeight;
        
        // Reset to start height for animation
        modalContent.style.height = startHeight + 'px';
        modalContent.style.opacity = '0';
        
        // Force reflow
        void modalContent.offsetHeight;
        
        // Phase 2: Animate height and fade in
        modalContent.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out 0.1s';
        modalContent.style.height = endHeight + 'px';
        modalContent.style.opacity = '1';
        
        setTimeout(() => {
            // Clean up - let height be auto again
            modalContent.style.height = '';
            modalContent.style.overflow = '';
            modalContent.style.transition = '';
            if (onComplete) onComplete();
        }, 350);
    }, 150);
}

// Show dialog when user changes level in character editor
// Transforms the existing edit modal content instead of overlaying a new modal
// Returns a promise that resolves to: 'auto' | 'manual' | 'cancel'
function showLevelChangeDialog(oldLevel, newLevel) {
    return new Promise((resolve) => {
        const editModal = document.getElementById('editDetailsModal');
        if (!editModal) {
            resolve('manual');
            return;
        }

        const modalContent = editModal.querySelector('.modal-content');
        if (!modalContent) {
            resolve('manual');
            return;
        }

        // Store original content
        const originalContent = modalContent.innerHTML;

        const levelDiff = newLevel - oldLevel;
        const direction = levelDiff > 0 ? 'up' : 'down';
        const levelText = Math.abs(levelDiff) === 1 ? 'level' : 'levels';

        // Create new content for level change dialog
        const levelChangeHtml = `<div class="modal-header"><h2 class="modal-title">LEVEL CHANGE</h2><button class="modal-close"id="levelChangeClose">&times;</button></div><div class="modal-body"><p class="terminal-text level-change-text">You're changing from<strong>Level\u00A0${oldLevel}</strong>to<strong>Level\u00A0${newLevel}</strong>\u00A0(${Math.abs(levelDiff)}\u00A0${levelText}\u00A0${direction}).</p><p class="terminal-text-small"style="margin-top: 0.75rem; opacity: 0.8;">Would you like to automatically recalculate stats&nbsp;(HP,&nbsp;Proficiency Bonus)&nbsp;for the new level,or update them manually?</p></div><div class="modal-footer"style="flex-wrap: wrap; gap: 0.5rem;"><button class="terminal-btn"id="levelChangeManual">KEEP MANUAL</button><button class="terminal-btn terminal-btn-primary"id="levelChangeAuto">AUTO-CALCULATE</button></div>`;

        // Animate transition to level change dialog
        animateModalContentSwap(modalContent, levelChangeHtml, () => {
            const closeBtn = document.getElementById('levelChangeClose');
            const manualBtn = document.getElementById('levelChangeManual');
            const autoBtn = document.getElementById('levelChangeAuto');

            const restoreAndResolve = (result) => {
                if (result === 'cancel') {
                    // Animate back to original content
                    animateModalContentSwap(modalContent, originalContent, () => {
                        // Restore the level value the user had entered (not the original)
                        const levelInput = document.getElementById('editLevel');
                        if (levelInput) {
                            levelInput.value = newLevel;
                        }
                        resolve(result);
                    });
                } else if (result === 'auto') {
                    // Show cube loader while "calculating", then proceed with save
                    const loadingHtml = `<div class="modal-header"><h2 class="modal-title">LEVEL CHANGE</h2></div><div class="modal-body"style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 150px;"><div class="panel-loading-cube-container"><div class="panel-loading-cube"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><p class="terminal-text-small"style="margin-top: 1rem; opacity: 0.8;">Calculating stats for Level ${newLevel}...</p></div>`;
                    
                    animateModalContentSwap(modalContent, loadingHtml, () => {
                        // Show loader briefly, then resolve to proceed with save
                        setTimeout(() => {
                            resolve(result);
                        }, 500);
                    });
                } else {
                    // Restore original form content for manual, keeping the new level value
                    animateModalContentSwap(modalContent, originalContent, () => {
                        // Restore the level value the user had entered (the new level)
                        const levelInput = document.getElementById('editLevel');
                        if (levelInput) {
                            levelInput.value = newLevel;
                        }
                        resolve(result);
                    });
                }
            };

            closeBtn?.addEventListener('click', () => restoreAndResolve('cancel'));
            manualBtn?.addEventListener('click', () => restoreAndResolve('manual'));
            autoBtn?.addEventListener('click', () => restoreAndResolve('auto'));

            // Focus the auto-calculate button after animation
            autoBtn?.focus();
        });
    });
}

// Calculate derived stats for a given level
// Returns { proficiencyBonus, hpMax } based on level, class hit die, and CON modifier
function calculateStatsForLevel(character, newLevel) {
    // Hit die mapping for standard 5e classes
    const HIT_DIE_BY_CLASS = {
        barbarian: 12,
        fighter: 10,
        paladin: 10,
        ranger: 10,
        cleric: 8,
        druid: 8,
        monk: 8,
        rogue: 8,
        bard: 8,
        warlock: 8,
        wizard: 6,
        sorcerer: 6,
    };

    // Get hit die
    let hitDie = character.hitDie || character.classData?.hitDie || null;
    if (!hitDie) {
        const rawClass = character.class || '';
        const normalized = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
        if (normalized && HIT_DIE_BY_CLASS[normalized]) {
            hitDie = HIT_DIE_BY_CLASS[normalized];
        }
    }
    if (!hitDie && window.DND_DATA && Array.isArray(window.DND_DATA.classes)) {
        const classIdOrName = character.class;
        if (classIdOrName) {
            const cls = window.DND_DATA.classes.find(
                (c) => c.id === classIdOrName || c.name === classIdOrName,
            );
            if (cls && cls.hitDie) {
                hitDie = cls.hitDie;
            }
        }
    }
    if (!hitDie) {
        hitDie = 8; // Default to d8 if unknown
    }

    // Get CON modifier
    const abilities = character.abilities || character.abilityScores || {};
    const conScore = abilities.con || 10;
    const conMod = Math.floor((conScore - 10) / 2);

    // Calculate proficiency bonus: ceil(level/4) + 1
    const proficiencyBonus = Math.ceil(newLevel / 4) + 1;

    // Calculate HP:
    // Level 1: hitDie + CON mod (max at level 1)
    // Each additional level: average die (hitDie/2 + 1) + CON mod
    const baseHP = hitDie + conMod;
    const averageDie = Math.floor(hitDie / 2) + 1;
    const perLevel = Math.max(1, averageDie + conMod);
    const hpMax = newLevel === 1 ? Math.max(1, baseHP) : Math.max(1, baseHP + perLevel * (newLevel - 1));

    return {
        proficiencyBonus,
        hpMax,
        hitDie,
    };
}

// Generic alert modal using terminal modal styles
// Optional `options.actionLabel` and `options.onAction` to show an action button
function showAlertDialog(message, options) {
    const existing = document.getElementById('genericAlertModal');
    if (existing) existing.remove();

    const escapedMessage = Utils.escapeHtml(message).replace(/\n/g, '<br>');
    const actionLabel = options && options.actionLabel;
    const actionButtonHtml = actionLabel
        ? `<button class="terminal-btn terminal-btn-secondary"id="genericAlertAction">${Utils.escapeHtml(actionLabel)}</button>`
        : '';
    
    const modalHtml = `<div id="genericAlertModal"class="modal show"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">NOTICE</h2><button class="modal-close"onclick="closeGenericAlertModal()">&times;</button></div><div class="modal-body"><p class="terminal-text">${escapedMessage}</p></div><div class="modal-footer modal-footer-end">${actionButtonHtml}<button class="terminal-btn terminal-btn-primary"id="genericAlertOk">OK</button></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericAlertModal');
    const okBtn = document.getElementById('genericAlertOk');
    const actionBtn = document.getElementById('genericAlertAction');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    okBtn.addEventListener('click', close);
    
    if (actionBtn && options && typeof options.onAction === 'function') {
        actionBtn.addEventListener('click', () => {
            close();
            options.onAction();
        });
    }

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// ========================================
// SESSION EXPIRED MODAL
// ========================================

// Show a modal when the session has expired proactively
function showSessionExpiredModal() {
    // Close any open editor modals first (e.g., level change dialog)
    // This prevents stale modal state from persisting
    closeAllEditorModals();
    
    const existing = document.getElementById('sessionExpiredModal');
    if (existing) existing.remove();

    const modalHtml = `<div id="sessionExpiredModal"class="modal show"><div class="modal-content"><div class="modal-header"><h2 class="modal-title">⚠ SESSION EXPIRED</h2></div><div class="modal-body"><p class="terminal-text">Your login session has expired.${' '}Your local changes are safe,${' '}but you'll need to log in again to sync with the cloud.</p></div><div class="modal-footer modal-footer-end"><button class="terminal-btn terminal-btn-secondary"id="sessionExpiredDismiss">CONTINUE OFFLINE</button><button class="terminal-btn terminal-btn-primary"id="sessionExpiredLogin">RE-LOGIN</button></div></div></div>`;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('sessionExpiredModal');
    const dismissBtn = document.getElementById('sessionExpiredDismiss');
    const loginBtn = document.getElementById('sessionExpiredLogin');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    dismissBtn.addEventListener('click', () => {
        close();
        showNotification('Working offline - log in to sync changes');
    });

    loginBtn.addEventListener('click', () => {
        close();
        // Small delay to let the modal close animation finish
        setTimeout(() => {
            showAuthModal();
        }, 200);
    });

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// Track guest notice state per session
let guestNoticeShownThisSession = false;
let userHasMadeChanges = false;

// Dismiss the guest notice banner (per-session only)
function dismissGuestNotice() {
    const guestNotice = document.getElementById('guestNotice');
    if (guestNotice) {
        guestNotice.classList.add('is-hidden');
        guestNoticeShownThisSession = true;
    }
}

// Show guest notice when user makes changes (if not logged in and not shown yet)
function maybeShowGuestNotice() {
    // Only show if not authenticated and hasn't been shown this session
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        return;
    }
    
    if (guestNoticeShownThisSession) {
        return;
    }
    
    const guestNotice = document.getElementById('guestNotice');
    if (guestNotice) {
        guestNotice.classList.remove('is-hidden');
        guestNoticeShownThisSession = true;
    }
}

// Mark that user has made changes (called when creating/editing characters)
function markUserChanges() {
    if (!userHasMadeChanges) {
        userHasMadeChanges = true;
        maybeShowGuestNotice();
    }
}

// ========================================
// SESSION IN PROGRESS NOTICE
// ========================================

const BUILDER_SESSION_KEY = 'danddy_builder_session';
let sessionNoticeDismissed = false;

// Check if there's a builder session in progress
function hasBuilderSession() {
    try {
        const raw = localStorage.getItem(BUILDER_SESSION_KEY);
        if (!raw) return false;
        const session = JSON.parse(raw);
        // Consider it a valid session if we have meaningful progress
        const hasProgress = session.currentQuestionId && session.currentQuestionId !== 'intro';
        const hasCharacterData = session.character && (
            session.character.name ||
            session.character.race ||
            session.character.class
        );
        return hasProgress || hasCharacterData;
    } catch {
        return false;
    }
}

// Get session preview for display
function getBuilderSessionPreview() {
    try {
        const raw = localStorage.getItem(BUILDER_SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Format time ago string
function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const savedDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - savedDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return savedDate.toLocaleDateString();
}

// Show the session notice if there's a session in progress
function maybeShowSessionNotice() {
    if (sessionNoticeDismissed) return;
    if (!hasBuilderSession()) return;
    
    const sessionNotice = document.getElementById('sessionNotice');
    const sessionNoticeTime = document.getElementById('sessionNoticeTime');
    
    if (sessionNotice) {
        const session = getBuilderSessionPreview();
        if (session && session._savedAt) {
            sessionNoticeTime.textContent = `· ${formatTimeAgo(session._savedAt)}`;
        }
        sessionNotice.classList.remove('is-hidden');
    }
}

// Dismiss the session notice (per-session only)
function dismissSessionNotice() {
    const sessionNotice = document.getElementById('sessionNotice');
    if (sessionNotice) {
        sessionNotice.classList.add('is-hidden');
        sessionNoticeDismissed = true;
    }
}

// Discard the builder session entirely (clears localStorage)
function discardBuilderSession() {
    try {
        localStorage.removeItem('danddy_builder_session');
        const sessionNotice = document.getElementById('sessionNotice');
        if (sessionNotice) {
            sessionNotice.classList.add('is-hidden');
        }
    } catch (e) {
        console.error('Failed to discard builder session:', e);
    }
}

// ========================================
// SPLASH SCREEN (manager uses welcome modal instead of a full-page splash)
// ========================================

// In the manager we don't actually block interaction behind a separate splash
// screen, so keep this false to ensure global keyboard shortcuts always work.
let splashActive = false;

// Track whether the auth modal was opened from the welcome splash CTA
// (LOG IN / CREATE ACCOUNT). When true, pressing Escape or CANCEL in the
// auth modal should return the user to the splash screen instead of
// leaving them on the main dashboard.
let authOpenedFromWelcome = false;

function dismissSplash(instant = false) {
    const splash = document.getElementById('splash-content');
    const mainContent = document.getElementById('main-content');
    
    if (splash && splashActive) {
        splashActive = false;
        
        if (instant) {
            // Skip animation entirely (used when returning from builder)
            splash.classList.add('is-hidden');
            mainContent.classList.remove('is-hidden');
            mainContent.classList.add('fade-in');
        } else {
            // Fade out splash
            splash.classList.add('fade-out');
            
            setTimeout(() => {
                splash.classList.add('is-hidden');
                mainContent.classList.remove('is-hidden');
                
                // Fade in main content
                setTimeout(() => {
                    mainContent.classList.add('fade-in');
                }, 50);
            }, 300);
        }
    }
}

// When the user explicitly cancels out of the auth flow (Escape, "X",
// or CANCEL button), close the auth modal and, if it was launched from
// the welcome splash, return to that splash screen instead of leaving
// them on the main dashboard.
function cancelAuthFlow() {
    closeAuthModal();

    if (authOpenedFromWelcome) {
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) {
            welcomeModal.classList.add('show');
            // Don't auto-focus any button - let the user choose
        }
        authOpenedFromWelcome = false;
    }
}

// ========================================
// AUTHENTICATION UI HANDLERS
// ========================================

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('show');
    }
    showLoginForm();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authError').classList.add('is-hidden');
    // Clear form fields
    document.getElementById('loginEmail').value = '';
    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.value = '';
        loginPassword.type = 'password';
    }
    document.getElementById('registerEmail').value = '';
    const registerPassword = document.getElementById('registerPassword');
    if (registerPassword) {
        registerPassword.value = '';
        registerPassword.type = 'password';
    }
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    if (registerPasswordConfirm) {
        registerPasswordConfirm.value = '';
        registerPasswordConfirm.type = 'password';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = 'LOGIN';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');

    const modal = document.getElementById('authModal');
    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = 'REGISTER';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');

    const modal = document.getElementById('authModal');
    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

function setAuthLoading(isLoading, message) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const cancelBtn = document.getElementById('authCancelBtn');
    const loadingLabel = message || 'CONTACTING SERVER...';

    [loginBtn, registerBtn, cancelBtn].forEach((btn) => {
        if (btn) {
            btn.disabled = isLoading;
        }
    });

    const cubeMarkup = 
        '<span class="spinner-cube-scene">' +
        '<span class="spinner-cube-tilt">' +
        '<span class="spinner-cube">' +
        '<span class="spinner-cube-face spinner-cube-face-front"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-back"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-right"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-left"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-top"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-bottom"></span>' +
        '</span></span></span>';
    
    if (loginBtn) {
        if (isLoading) {
            if (!loginBtn.dataset.originalLabel) {
                loginBtn.dataset.originalLabel = loginBtn.innerHTML;
            }
            // Cube spacing is handled by .spinner-cube-scene margin-right,
            // so avoid a literal leading space before the label.
            loginBtn.innerHTML = `${cubeMarkup}${loadingLabel}`;
        } else {
            if (loginBtn.dataset.originalLabel) {
                loginBtn.innerHTML = loginBtn.dataset.originalLabel;
                delete loginBtn.dataset.originalLabel;
            } else {
                loginBtn.textContent = 'LOGIN';
            }
        }
    }
    if (registerBtn) {
        if (isLoading) {
            if (!registerBtn.dataset.originalLabel) {
                registerBtn.dataset.originalLabel = registerBtn.innerHTML;
            }
            // Use the same cube markup as the login button; rely on CSS margin
            // for spacing instead of a leading space in the string.
            registerBtn.innerHTML = `${cubeMarkup}${loadingLabel}`;
        } else {
            if (registerBtn.dataset.originalLabel) {
                registerBtn.innerHTML = registerBtn.dataset.originalLabel;
                delete registerBtn.dataset.originalLabel;
            } else {
                registerBtn.textContent = 'REGISTER';
            }
        }
    }
}

async function handleLogin() {
    const errorEl = document.getElementById('authError');

    // If the login form isn't currently visible (e.g. the user has switched
    // to the register tab), quietly abort. This prevents stray events from
    // showing a "Please enter both email and password" message on the
    // REGISTER screen.
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl && loginFormEl.classList.contains('is-hidden')) {
        return;
    }

    // Some password managers (and browser autofill) can populate fields
    // slightly after the click event that triggers login. To avoid
    // spurious "Please enter both email and password" errors when the
    // UI *looks* filled in, give the DOM a short moment to settle
    // before reading values.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    errorEl.classList.add('is-hidden');
    setAuthLoading(true, 'LOGGING IN...');

    try {
        const result = await window.AuthService.login(email, password);
        if (result && result.success) {
            // Mark splash as dismissed on successful login
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            closeAuthModal();
            
            // Close any stale editor modals (e.g., level change dialog from previous session)
            closeAllEditorModals();
            
            updateAuthUI();
            showNotification(`✓ Logged in as ${email}`);

            // Start session monitoring now that user is logged in
            if (window.AuthService && typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Capture the currently selected character ID before loading
            // so we can restore the sheet after re-authentication
            const previouslySelectedId = AppState.selectedCharacterId;
            
            // Check if should migrate user-created characters first
            if (window.MigrationService.hasLocalCharacters()) {
                showMigrationModal();
            }
            // Then check for demo character migration (only ask once)
            else if (shouldShowDemoMigration()) {
                showDemoMigrationModal();
            } else {
                // Reload characters from cloud
                await AppState.loadCharacters();
                UI.render();
                
                // If a character was selected before session expired, restore the sheet.
                // UI.render() won't re-call viewCharacter if the selection "hasn't changed",
                // but the sheet may have been left empty due to a failed fetch.
                if (previouslySelectedId) {
                    const stillExists = AppState.filteredCharacters.some(
                        c => String(c.id) === String(previouslySelectedId)
                    );
                    if (stillExists) {
                        viewCharacter(previouslySelectedId, { skipKeyboardSync: true });
                    }
                }
            }
            
            // Check for pending character shares (after a short delay to not overwhelm)
            setTimeout(() => checkPendingShares(), 500);
        } else {
            errorEl.textContent = (result && result.error) || 'Login failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    } finally {
        setAuthLoading(false);
    }
}

async function handleRegister() {
    const errorEl = document.getElementById('authError');

    // Some password managers (and browser autofill) populate fields slightly
    // after the click event that triggers registration. To avoid spurious
    // "Please fill in all fields" errors when the UI *looks* filled in, give
    // the DOM a short moment to settle before reading values.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const passwordConfirmInput = document.getElementById('registerPasswordConfirm');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';

    if (!email || !password || !passwordConfirm) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    if (password !== passwordConfirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('is-hidden');
        return;
    }

    // Validate password length (bcrypt limit is 72 bytes)
    if (new Blob([password]).size > 72) {
        errorEl.textContent = 'Password is too long (max 72 bytes)';
        errorEl.classList.remove('is-hidden');
        return;
    }

    errorEl.classList.add('is-hidden');
    setAuthLoading(true, 'CREATING ACCOUNT...');

    try {
        const result = await window.AuthService.register(email, password);
        if (result.success) {
            // Mark splash as dismissed on successful registration
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            closeAuthModal();
            updateAuthUI();
            showNotification(`✓ Registered as ${email}`);

            // Start session monitoring now that user is logged in
            if (window.AuthService && typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Check if should migrate user-created characters first
            if (window.MigrationService.hasLocalCharacters()) {
                showMigrationModal();
            } 
            // Then check for demo character migration (only ask once)
            else if (shouldShowDemoMigration()) {
                showDemoMigrationModal();
            } else {
                // Reload characters from cloud
                await AppState.loadCharacters();
                UI.render();
            }
            
            // Check for pending character shares (after a short delay to not overwhelm)
            setTimeout(() => checkPendingShares(), 500);
        } else {
            errorEl.textContent = result.error || 'Registration failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Registration failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    } finally {
        setAuthLoading(false);
    }
}

// ========================================
// PASSWORD RESET UI HANDLERS
// ========================================

function openPasswordResetFromLogin() {
    // Close the auth modal to reduce clutter and then open the reset flow.
    closeAuthModal();
    showPasswordResetModal();
}

function showPasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    if (!modal) return;

    // Reset sections and fields to initial state
    const modalTitle = document.getElementById('passwordResetModalTitle');
    const requestSection = document.getElementById('passwordResetRequestSection');
    const successSection = document.getElementById('passwordResetSuccessSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const cancelBtn = document.getElementById('passwordResetCancelBtn');
    const closeBtn = document.getElementById('passwordResetCloseBtn');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const messageEl = document.getElementById('passwordResetMessage');
    const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
    const emailInput = document.getElementById('passwordResetEmail');
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');

    if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
    if (requestSection) requestSection.classList.remove('is-hidden');
    if (successSection) successSection.classList.add('is-hidden');
    if (confirmSection) confirmSection.classList.add('is-hidden');
    if (cancelBtn) cancelBtn.classList.remove('is-hidden');
    if (closeBtn) closeBtn.classList.add('is-hidden');
    if (requestBtn) requestBtn.classList.remove('is-hidden');
    if (confirmBtn) confirmBtn.classList.add('is-hidden');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.classList.remove('terminal-text-error');
        messageEl.classList.add('terminal-text-dim');
    }
    if (confirmMessageEl) {
        confirmMessageEl.textContent = '';
        confirmMessageEl.classList.remove('terminal-text-error');
        confirmMessageEl.classList.add('terminal-text-dim');
    }
    if (emailInput) emailInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';

    modal.classList.add('show');
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    }
}

function closePasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    if (!modal) return;
    modal.classList.remove('show');
    
    // Reset to initial state when closing
    setTimeout(() => {
        const modalTitle = document.getElementById('passwordResetModalTitle');
        const requestSection = document.getElementById('passwordResetRequestSection');
        const successSection = document.getElementById('passwordResetSuccessSection');
        const confirmSection = document.getElementById('passwordResetConfirmSection');
        const cancelBtn = document.getElementById('passwordResetCancelBtn');
        const closeBtn = document.getElementById('passwordResetCloseBtn');
        const requestBtn = document.getElementById('passwordResetRequestBtn');
        const confirmBtn = document.getElementById('passwordResetConfirmBtn');
        const messageEl = document.getElementById('passwordResetMessage');
        const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
        const emailInput = document.getElementById('passwordResetEmail');
        const tokenInput = document.getElementById('passwordResetToken');
        const newPasswordInput = document.getElementById('passwordResetNewPassword');

        if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
        if (requestSection) requestSection.classList.remove('is-hidden');
        if (successSection) successSection.classList.add('is-hidden');
        if (confirmSection) confirmSection.classList.add('is-hidden');
        if (cancelBtn) cancelBtn.classList.remove('is-hidden');
        if (closeBtn) closeBtn.classList.add('is-hidden');
        if (requestBtn) requestBtn.classList.remove('is-hidden');
        if (confirmBtn) confirmBtn.classList.add('is-hidden');
        if (messageEl) {
            messageEl.textContent = '';
            messageEl.classList.remove('terminal-text-error');
            messageEl.classList.add('terminal-text-dim');
        }
        if (confirmMessageEl) {
            confirmMessageEl.textContent = '';
            confirmMessageEl.classList.remove('terminal-text-error');
            confirmMessageEl.classList.add('terminal-text-dim');
        }
        if (emailInput) emailInput.value = '';
        if (tokenInput) tokenInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
    }, 300); // Wait for modal close animation
}

async function handlePasswordResetRequest() {
    const emailInput = document.getElementById('passwordResetEmail');
    const messageEl = document.getElementById('passwordResetMessage');
    if (!emailInput || !messageEl) return;

    const email = emailInput.value.trim();
    if (!email) {
        messageEl.textContent = 'Please enter your email address.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    messageEl.textContent = 'Requesting password reset...';
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');

    const result = await window.AuthService.forgotPassword(email);

    if (!result.success) {
        messageEl.textContent = result.error || 'Password reset request failed. Please try again.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    // Transform modal to success confirmation
    const modalTitle = document.getElementById('passwordResetModalTitle');
    const requestSection = document.getElementById('passwordResetRequestSection');
    const successSection = document.getElementById('passwordResetSuccessSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const cancelBtn = document.getElementById('passwordResetCancelBtn');
    const closeBtn = document.getElementById('passwordResetCloseBtn');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const tokenInput = document.getElementById('passwordResetToken');

    // In development, the backend may return a debug token for testing
    if (result.debugToken && tokenInput) {
        tokenInput.value = result.debugToken;
        
        // In dev mode, show the confirm section so developers can test without email
        if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
        if (requestSection) requestSection.classList.add('is-hidden');
        if (successSection) successSection.classList.add('is-hidden');
        if (confirmSection) confirmSection.classList.remove('is-hidden');
        if (cancelBtn) cancelBtn.classList.remove('is-hidden');
        if (closeBtn) closeBtn.classList.add('is-hidden');
        if (requestBtn) requestBtn.classList.add('is-hidden');
        if (confirmBtn) confirmBtn.classList.remove('is-hidden');
        
        const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
        if (confirmMessageEl) {
            confirmMessageEl.textContent = '[DEV MODE] Token auto-filled for testing. Enter your new password below.';
            confirmMessageEl.classList.add('terminal-text-dim');
        }
    } else {
        // Production mode - show success confirmation
        if (modalTitle) modalTitle.textContent = 'SUCCESS';
        if (requestSection) requestSection.classList.add('is-hidden');
        if (successSection) successSection.classList.remove('is-hidden');
        if (confirmSection) confirmSection.classList.add('is-hidden');
        if (cancelBtn) cancelBtn.classList.add('is-hidden');
        if (closeBtn) closeBtn.classList.remove('is-hidden');
        if (requestBtn) requestBtn.classList.add('is-hidden');
        if (confirmBtn) confirmBtn.classList.add('is-hidden');
    }
}

async function handlePasswordResetConfirm() {
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');
    const messageEl = document.getElementById('passwordResetConfirmMessage');
    if (!tokenInput || !newPasswordInput || !messageEl) return;

    const token = tokenInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!token) {
        messageEl.textContent = 'Invalid reset link. Please request a new password reset.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    if (!newPassword) {
        messageEl.textContent = 'Please enter a new password.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    messageEl.textContent = 'Resetting password...';
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');

    // Call the password reset API directly (don't use the returned token)
    try {
        const response = await fetch(`${window.DanddyConfig.API_BASE_URL}/auth/password/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, new_password: newPassword }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Password reset failed');
        }

        // Password reset successful - close this modal and open login modal
        showNotification('✓ Password updated successfully! Please log in with your new password.');
        closePasswordResetModal();
        
        // Open the login modal after a brief delay
        setTimeout(() => {
            showLoginForm();
        }, 300);
        
    } catch (error) {
        messageEl.textContent = error.message || 'Password reset failed. Please try again.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
    }
}

async function handleLogout() {
    // Close all editor modals to prevent stale state (e.g., level change dialog)
    closeAllEditorModals();
    
    window.AuthService.logout();
    updateAuthUI();
    showNotification('✓ Logged out');
    
    // Reload with local storage
    await AppState.loadCharacters();
    UI.render();
    
    // Clear the dismissed flag so welcome modal appears on explicit logout
    sessionStorage.removeItem('welcomeSplashDismissed');
    
    // Show welcome modal (splash screen) after logout
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
        welcomeModal.classList.add('show');
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const userStatusIcon = document.getElementById('userStatusIcon');
    const userStatusText = document.getElementById('userStatusText');
    const guestNotice = document.getElementById('guestNotice');
    
    // Overflow menu elements
    const overflowAuthIcon = document.getElementById('overflowAuthIcon');
    const overflowAuthLabel = document.getElementById('overflowAuthLabel');
    
    // If the header shell isn't present (e.g., in some embedded contexts),
    // safely bail out.
    if (!authBtn || !userInfoDisplay || !userStatusIcon || !userStatusText) {
        return;
    }
    
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userStatusIcon.textContent = '☁';
        userStatusText.textContent = user ? user.email : 'Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;
        
        // Update overflow menu
        if (overflowAuthIcon) overflowAuthIcon.textContent = '←';
        if (overflowAuthLabel) overflowAuthLabel.textContent = 'Logout';

        // Hide guest notice when logged in
        if (guestNotice) {
            guestNotice.classList.add('is-hidden');
        }
    } else {
        userStatusIcon.textContent = '▣';
        userStatusText.textContent = 'Local Storage';
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = () => {
            authOpenedFromWelcome = false;
            showAuthModal();
        };
        
        // Update overflow menu
        if (overflowAuthIcon) overflowAuthIcon.textContent = '→';
        if (overflowAuthLabel) overflowAuthLabel.textContent = 'Login';

        // Don't show guest notice by default - only when user makes changes
        // (handled by maybeShowGuestNotice() function)
    }
}

// ========================================
// MIGRATION UI HANDLERS
// ========================================

function showMigrationModal() {
    const count = window.MigrationService.getLocalCharacterCount();
    document.getElementById('migrationCount').textContent = count;
    const modal = document.getElementById('migrationModal');
    if (modal) {
        modal.classList.add('show');
        focusFirstFieldInModal(modal);
    }
}

function closeMigrationModal() {
    document.getElementById('migrationModal').classList.remove('show');
    
    // After user-created migration, also ask about demo characters (once)
    if (shouldShowDemoMigration()) {
        showDemoMigrationModal();
    } else {
        // Reload characters after closing (whether migrated or not)
        AppState.loadCharacters().then(() => UI.render());
    }
}

async function startMigration() {
    const statusEl = document.getElementById('migrationStatus');
    statusEl.classList.remove('is-hidden');
    // Directly start migration without auto-downloading a JSON backup.
    statusEl.textContent = 'Migrating to cloud...';
    
    try {
        // Migrate (excluding demo characters - they have their own modal)
        const results = await window.MigrationService.migrateToCloud({ includeDemoCharacters: false });
        
        if (results.success > 0) {
            statusEl.textContent = `✓ Migrated ${results.success}character(s)successfully!`;
            
            if (results.failed > 0) {
                statusEl.textContent += `\n⚠️ ${results.failed}character(s)failed to migrate.`;
            }
            
            // Clear local storage after successful migration
            if (results.failed === 0) {
                setTimeout(() => {
                    window.MigrationService.clearLocalStorage();
                    showNotification(`✓ Migrated ${results.success}characters to cloud`);
                    closeMigrationModal();
                }, 2000);
            } else {
                setTimeout(() => {
                    showNotification(`⚠️ Migration completed with ${results.failed}error(s)`);
                    closeMigrationModal();
                }, 3000);
            }
        } else {
            statusEl.textContent = '❌ Migration failed. Your local data is safe.';
            setTimeout(() => closeMigrationModal(), 2000);
        }
    } catch (error) {
        console.error('Migration error:', error);
        statusEl.textContent = '❌ Migration failed: ' + error.message;
        setTimeout(() => closeMigrationModal(), 3000);
    }
}

// ========================================
// DEMO CHARACTER MIGRATION UI HANDLERS
// ========================================

function showDemoMigrationModal() {
    if (!window.DemoCharacters) return;
    
    // Mark that we've asked about demo migration
    window.DemoCharacters.markMigrationAsked();
    
    const demoChars = window.DemoCharacters.getAll();
    const count = demoChars.length;
    
    document.getElementById('demoMigrationCount').textContent = count;
    
    // Populate the demo character list
    const listEl = document.getElementById('demoCharacterList');
    if (listEl) {
        listEl.innerHTML = demoChars.map(char => {
            const raceName = char.raceData?.name || char.race || '?';
            const className = char.classData?.name || char.class || '?';
            return `<li><span class="demo-char-name">${Utils.escapeHtml(char.name)}</span><span class="demo-char-info">– Level ${char.level}${raceName}${className}</span></li>`;
        }).join('');
    }
    
    const modal = document.getElementById('demoMigrationModal');
    if (modal) {
        modal.classList.add('show');
        focusFirstFieldInModal(modal);
    }
}

function closeDemoMigrationModal(skipReload = false) {
    const modal = document.getElementById('demoMigrationModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    if (!skipReload) {
        // Reload characters from cloud
        AppState.loadCharacters().then(() => UI.render());
    }
}

async function migrateDemoCharacters() {
    try {
        // Get demo characters
        const demoChars = window.DemoCharacters ? window.DemoCharacters.getAll() : [];
        
        if (demoChars.length === 0) {
            closeDemoMigrationModal();
            return;
        }
        
        let successCount = 0;
        
        for (const demo of demoChars) {
            try {
                // Copy demo character to cloud (remove demo flags)
                const charToAdd = { ...demo };
                delete charToAdd.isDemo;
                delete charToAdd.id;  // Let cloud assign new ID
                
                await window.CharacterCloudStorage.add(charToAdd);
                successCount++;
            } catch (error) {
                console.error('Failed to migrate demo character:', demo.name, error);
            }
        }
        
        if (successCount > 0) {
            showNotification(`✓ Added ${successCount}sample character(s)to your account`);
        }
        
        closeDemoMigrationModal();
    } catch (error) {
        console.error('Demo migration error:', error);
        showNotification('Failed to add sample characters', 'error');
        closeDemoMigrationModal();
    }
}

// Check if we should show demo migration prompt after registration/login
function shouldShowDemoMigration() {
    if (!window.DemoCharacters) return false;
    if (window.DemoCharacters.hasMigrationBeenAsked()) return false;
    
    // Only show if there are demo characters
    return window.MigrationService.hasDemoCharacters();
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize modal behaviors (backdrop click, dirty checking)
    ModalManager.init();
    
    // Initialize mobile view handling (resize transitions)
    MobileView.init();
    
    // Show panel loading spinners as early as possible so the shell never feels empty
    // while we verify auth state and fetch characters.
    if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
        UI.setLoadingState(true);
    }

    // Apply app version to header and welcome modal from global version config.
    try {
        const version = window.DANDDY_VERSION || '2.0.0';
        const headerTitleText = document.querySelector('.terminal-title-text');
        const welcomeVersion = document.querySelector('.welcome-version');
        if (headerTitleText) {
            headerTitleText.textContent = `DandDy v${version}`;
        }
        if (welcomeVersion) {
            welcomeVersion.textContent = `DandDy v${version}`;
        }
    } catch (e) {
        console.warn('Version banner update failed:', e);
    }

    // Determine auth state up front (and validate token) so the UI and
    // storage mode (cloud vs local) start in a consistent state.
    //
    // However, we don't want a slow or unreachable backend to block the entire
    // UI. Wrap the async token verification in a soft timeout so the manager
    // can still become interactive even if /auth/me is slow.
    let isAuthenticated = false;
    if (window.AuthService) {
        const verify = async () => {
            if (typeof window.AuthService.verifyToken === 'function') {
                try {
                    const result = await window.AuthService.verifyToken();
                    return !!result;
                } catch (e) {
                    console.warn('Auth token verification failed:', e);
                    return false;
                }
            } else if (typeof window.AuthService.isAuthenticated === 'function') {
                try {
                    return !!window.AuthService.isAuthenticated();
                } catch (e) {
                    console.warn('Auth isAuthenticated check failed:', e);
                    return false;
                }
            }
            return false;
        };

        const withTimeout = (promise, ms, label) => {
            let timeoutId;
            const timeoutPromise = new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    console.warn(`[Boot]${label}timed out after ${ms}ms;continuing in guest mode.`);
                    resolve(false);
                }, ms);
            });

            return Promise.race([promise, timeoutPromise]).finally(() => {
                clearTimeout(timeoutId);
            });
        };

        isAuthenticated = await withTimeout(verify(), 5000, 'AuthService.verifyToken');
    }

    // Sync header / guest notice with actual auth state
    updateAuthUI();

    // Start session monitoring if authenticated, and listen for expiry events
    if (isAuthenticated && window.AuthService && typeof window.AuthService.startSessionMonitor === 'function') {
        window.AuthService.startSessionMonitor();
    }

    // Listen for session expired events to show the modal
    window.addEventListener('danddy:sessionExpired', () => {
        showSessionExpiredModal();
    });

    // Check if user is returning from builder or has already dismissed the splash
    const urlParams = new URLSearchParams(window.location.search);
    const fromBuilder = urlParams.get('from') === 'builder';
    const splashDismissed = sessionStorage.getItem('welcomeSplashDismissed') === 'true';

    // Show session notice if there's a builder session in progress
    // (but not if returning from builder - they just left intentionally)
    if (!fromBuilder) {
        maybeShowSessionNotice();
    }

    // Show guest notice banner if returning from builder after saving while not logged in
    if (fromBuilder && !isAuthenticated) {
        const showGuestNotice = sessionStorage.getItem('showGuestNoticeOnReturn') === 'true';
        if (showGuestNotice) {
            sessionStorage.removeItem('showGuestNoticeOnReturn'); // Clear the flag
            // Show the banner after a short delay to ensure DOM is ready
            setTimeout(() => {
                maybeShowGuestNotice();
            }, 100);
        }
    }

    // Show welcome modal (splash art + three choices) only when not logged in.
    const welcomeModal = document.getElementById('welcomeModal');
    // Wire welcome modal buttons: LOG IN, CREATE ACCOUNT, GUEST MODE
    const welcomeLoginBtn = document.getElementById('welcomeLoginBtn');
    if (welcomeLoginBtn) {
        welcomeLoginBtn.addEventListener('click', () => {
            authOpenedFromWelcome = true;
            // Don't set dismissed flag yet - only set it on successful login
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
        });
    }

    const welcomeRegisterBtn = document.getElementById('welcomeRegisterBtn');
    if (welcomeRegisterBtn) {
        welcomeRegisterBtn.addEventListener('click', () => {
            authOpenedFromWelcome = true;
            // Don't set dismissed flag yet - only set it on successful registration
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
            showRegisterForm();
        });
    }

    const welcomeDemoBtn = document.getElementById('welcomeDemoBtn');
    if (welcomeDemoBtn) {
        welcomeDemoBtn.addEventListener('click', () => {
            // Mark splash as dismissed so it won't reappear when returning from builder
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            // Close the modal
            if (welcomeModal) welcomeModal.classList.remove('show');
            // Show guest notice to explain limits and encourage account creation
            setTimeout(() => {
                maybeShowGuestNotice();
            }, 100);
        });
    }

    // Keyboard navigation inside welcome modal (splash screen)
    if (welcomeModal) {
        const welcomeButtons = Array.from(
            welcomeModal.querySelectorAll('.welcome-actions .terminal-btn'),
        );
        let welcomeIndex = 0;

        const focusWelcomeButton = (index) => {
            if (!welcomeButtons.length) return;
            const clamped = (index + welcomeButtons.length) % welcomeButtons.length;
            welcomeIndex = clamped;
            const btn = welcomeButtons[clamped];
            if (btn) {
                btn.focus();
            }
        };

        // Show welcome modal only if:
        // 1. User is not authenticated, AND
        // 2. User hasn't already dismissed the splash this session (e.g., by clicking DEMO MODE), AND
        // 3. User is not returning from the builder
        if (!isAuthenticated && !splashDismissed && !fromBuilder) {
            welcomeModal.classList.add('show');
            // Don't auto-focus any button - let the user choose
        }

        welcomeModal.addEventListener('keydown', (e) => {
            if (!welcomeModal.classList.contains('show')) return;

            // Limit handling to arrow keys and Enter. We intentionally do NOT
            // handle Escape here so users must make an explicit choice.
            const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
            if (!navKeys.includes(e.key)) return;

            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Enter') {
                const btn = document.activeElement.classList.contains('terminal-btn')
                    ? document.activeElement
                    : welcomeButtons[welcomeIndex] || welcomeButtons[0];
                if (btn && typeof btn.click === 'function') {
                    btn.click();
                }
                return;
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                focusWelcomeButton(welcomeIndex - 1);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                focusWelcomeButton(welcomeIndex + 1);
            }
        });
    }

    // Add Enter key support for login/register forms
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');

    // Add Enter key support for login form
    if (loginUsernameInput) {
        loginUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }

    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }

    // Add Enter key support for register form
    // Email and password fields already trigger registration on Enter.

    if (registerEmailInput) {
        registerEmailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegister();
            }
        });
    }

    if (registerPasswordInput) {
        registerPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegister();
            }
        });
    }

    // Wire up password visibility toggles in auth + reset modals
    const passwordToggleButtons = document.querySelectorAll('.password-toggle-btn');
    passwordToggleButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? 'HIDE' : 'SHOW';
            btn.setAttribute('aria-pressed', String(isPassword));
            btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    });

    // Note: Debug listeners removed - they were interfering with button clicks

    // Pre-load demo characters from API, then load ASCII art BEFORE initializing app state.
    // This ensures demo characters have portraits ready when displayed.
    const initApp = async () => {
        if (window.DemoCharacters) {
            try {
                // First, try to fetch demo characters from the API
                if (typeof window.DemoCharacters.fetchFromApi === 'function') {
                    await window.DemoCharacters.fetchFromApi();
                }
                // Then load ASCII art for any characters that need it
                if (typeof window.DemoCharacters.loadAsciiForAllDemoCharacters === 'function') {
                    await window.DemoCharacters.loadAsciiForAllDemoCharacters();
                }
            } catch (e) {
                console.warn('Failed to load demo characters:', e);
            }
        }
        
        // Initialize app state after demo characters are loaded
        await AppState.init();
    };
    
    initApp().catch((e) => {
        console.error('App initialization failed:', e);
    });

    // Setup event listeners
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const sortToggleBtn = document.getElementById('sortToggleBtn');
    const sortDropdown = document.getElementById('sortDropdown');

    const updateClearSearchVisibility = () => {
        if (!clearSearchBtn || !searchInput) return;
        const hasValue = searchInput.value.trim().length > 0;
        const isDisabled = searchInput.disabled;
        clearSearchBtn.classList.toggle('is-hidden', !hasValue || isDisabled);
    };

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            AppState.searchTerm = e.target.value;
            AppState.applyFilters();
            UI.render();
            updateClearSearchVisibility();
        });
    }

    if (clearSearchBtn && searchInput) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput.disabled) return;
            searchInput.value = '';
            AppState.searchTerm = '';
            AppState.applyFilters();
            UI.render();
            searchInput.focus();
            updateClearSearchVisibility();
        });
        updateClearSearchVisibility();
    }

    // Update search placeholder on viewport resize (debounced)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            UI.updateCount();
        }, 100);
    });

    // Sort dropdown behavior - now uses standard CharacterSheet.toggleSelectorMenu()
    if (sortToggleBtn && sortDropdown) {
        // Size the sort trigger based on the longest option label so the
        // button width is driven by content but stays fixed as labels change.
        const sizeSortTrigger = () => {
            const options = sortDropdown.querySelectorAll('.sort-option');
            if (!options.length) return;

            let maxLabelChars = 0;
            options.forEach((opt) => {
                const label = (opt.textContent || '').trim();
                if (label.length > maxLabelChars) {
                    maxLabelChars = label.length;
                }
            });

            // Account for "Sort: " prefix plus a little breathing room.
            const totalChars = 'Sort: '.length + maxLabelChars + 2;
            sortToggleBtn.style.minWidth = `${totalChars}ch`;
        };

        const updateSortUI = () => {
            // Update the button label to spell out the current sort mode
            const sortLabels = {
                alphabetical: 'Alphabetical',
                dateModified: 'Date modified',
            };
            const currentLabel = sortLabels[AppState.sortMode] || 'Date modified';
            sortToggleBtn.textContent = `Sort:${currentLabel}`;

            // Keep the listbox selection state in sync with the trigger label.
            // This ensures the option marked as selected in the listbox always
            // matches the active sort mode shown in the button.
            const options = sortDropdown.querySelectorAll('.sort-option');
            options.forEach((opt) => {
                const value = opt.getAttribute('data-sort-value');
                const isSelected = value === AppState.sortMode;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });

            // Ensure width stays sized for the longest label
            sizeSortTrigger();
        };

        const sortOptions = Array.from(sortDropdown.querySelectorAll('.sort-option'));

        sortOptions.forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.getAttribute('data-sort-value');
                if (value === 'alphabetical' || value === 'dateModified') {
                    AppState.sortMode = value;
                    AppState.applyFilters();
                    UI.render();
                }
                // Note: CharacterSheet.toggleSelectorMenu handles closing the menu
                updateSortUI();
            });
        });

        // Initialize selection state and trigger sizing
        sizeSortTrigger();
        updateSortUI();
    }

    // Wire header buttons (guard against missing elements so init doesn't crash)
    const newCharacterBtn = document.getElementById('newCharacterBtn');
    const newCharacterTooltip = document.getElementById('newCharacterTooltip');
    if (newCharacterBtn) {
        newCharacterBtn.addEventListener('click', createNewCharacter);
        
        // Show/hide custom tooltip on hover
        if (newCharacterTooltip) {
            newCharacterBtn.addEventListener('mouseenter', () => {
                if (newCharacterTooltip.textContent) {
                    newCharacterTooltip.classList.add('show');
                }
            });
            newCharacterBtn.addEventListener('mouseleave', () => {
                newCharacterTooltip.classList.remove('show');
            });
            // Also hide on focus out for keyboard users
            newCharacterBtn.addEventListener('focus', () => {
                if (newCharacterTooltip.textContent) {
                    newCharacterTooltip.classList.add('show');
                }
            });
            newCharacterBtn.addEventListener('blur', () => {
                newCharacterTooltip.classList.remove('show');
            });
        }
    }

    // Check creation quota on load and listen for updates
    updateCreationQuotaState();
    
    // Also check demo mode character limit immediately (doesn't require API call)
    if (window.DemoCharacters && DemoCharacters.isDemoMode() && DemoCharacters.hasReachedCharacterLimit()) {
        const btn = document.getElementById('newCharacterBtn');
        const overflowBtn = document.getElementById('overflowNewCharBtn');
        const tooltip = document.getElementById('newCharacterTooltip');
        const limit = DemoCharacters.DEMO_MAX_USER_CHARACTERS;
        
        [btn, overflowBtn].forEach(b => {
            if (!b) return;
            b.disabled = true;
            b.title = '';
            b.classList.add('is-quota-exhausted');
        });
        if (tooltip) {
            tooltip.textContent = `Guest limit:${limit}characters`;
        }
    }
    
    window.addEventListener('danddy:creationQuotaUpdate', (e) => {
        if (e.detail && typeof e.detail.remaining === 'number') {
            _creationQuotaRemaining = e.detail.remaining;
            const btn = document.getElementById('newCharacterBtn');
            const overflowBtn = document.getElementById('overflowNewCharBtn');
            const tooltip = document.getElementById('newCharacterTooltip');
            
            let tooltipText = '';
            [btn, overflowBtn].forEach(b => {
                if (!b) return;
                if (e.detail.remaining === -1) {
                    b.disabled = false;
                    b.title = '';
                    b.classList.remove('is-quota-exhausted');
                    tooltipText = '';
                } else if (e.detail.remaining === 0) {
                    b.disabled = true;
                    b.title = '';
                    b.classList.add('is-quota-exhausted');
                    tooltipText = 'Daily limit reached';
                } else {
                    b.disabled = false;
                    b.title = '';
                    b.classList.remove('is-quota-exhausted');
                    tooltipText = `${e.detail.remaining}${' '}creation${e.detail.remaining===1?'':'s'}${' '}remaining`;
                }
            });
            if (tooltip) {
                tooltip.textContent = tooltipText;
            }
        }
    });

    // Check image quota on load and listen for updates (for Customize portrait button)
    updateImageQuotaState();
    window.addEventListener('danddy:imageQuotaUpdate', (e) => {
        if (e.detail && typeof e.detail.remaining === 'number') {
            const oldRemaining = window._imageQuotaRemaining;
            window._imageQuotaRemaining = e.detail.remaining;
            
            // Re-render character sheet if quota just became exhausted
            if (e.detail.remaining === 0 && oldRemaining !== 0 && AppState.selectedCharacterId) {
                viewCharacter(AppState.selectedCharacterId, { skipKeyboardSync: true });
            }
        }
    });

    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', showImportModal);
    }
    
    // Update filename display when file is selected
    document.getElementById('importFile').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('fileName');
        const importButton = document.querySelector('#importModal .modal-footer .terminal-btn-primary');
        
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
            // Enable import button when file is selected
            if (importButton) {
                importButton.disabled = false;
            }
        } else {
            fileNameDisplay.textContent = '';
            // Disable import button when no file
            if (importButton) {
                importButton.disabled = true;
            }
        }
    });

    // Close import modal on outside click
    document.getElementById('importModal').addEventListener('click', (e) => {
        if (e.target.id === 'importModal') {
            closeImportModal();
        }
    });
    
    // Close duplicate modal on outside click
    document.getElementById('duplicateModal').addEventListener('click', (e) => {
        if (e.target.id === 'duplicateModal') {
            closeDuplicateModal();
        }
    });
    
    // Close portrait prompt modal on outside click
    document.getElementById('portraitPromptModal').addEventListener('click', (e) => {
        if (e.target.id === 'portraitPromptModal') {
            closePortraitPromptModal();
        }
    });
    
    // Close password reset modal on outside click
    document.getElementById('passwordResetModal').addEventListener('click', (e) => {
        if (e.target.id === 'passwordResetModal') {
            closePasswordResetModal();
        }
    });

    // Handle password reset token from URL fragment (e.g. when coming from email link)
    try {
        const hash = window.location.hash || '';
        
        // Check for password reset modal request
        if (hash === '#password-reset') {
            showPasswordResetModal();
            // Clear hash from URL
            history.replaceState(
                null,
                document.title,
                window.location.pathname + window.location.search,
            );
        }
        
        // Check for reset token in hash
        const tokenMatch = hash.match(/reset-token=([^&]+)/);
        if (tokenMatch && tokenMatch[1]) {
            const token = decodeURIComponent(tokenMatch[1]);
            showPasswordResetModal();
            
            // Auto-fill the token (hidden field) and switch to password input
            const tokenInput = document.getElementById('passwordResetToken');
            if (tokenInput) {
                tokenInput.value = token;
            }
            
            // Switch to the password reset confirmation section
            const modalTitle = document.getElementById('passwordResetModalTitle');
            const requestSection = document.getElementById('passwordResetRequestSection');
            const successSection = document.getElementById('passwordResetSuccessSection');
            const confirmSection = document.getElementById('passwordResetConfirmSection');
            const cancelBtn = document.getElementById('passwordResetCancelBtn');
            const closeBtn = document.getElementById('passwordResetCloseBtn');
            const requestBtn = document.getElementById('passwordResetRequestBtn');
            const confirmBtn = document.getElementById('passwordResetConfirmBtn');
            
            if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
            if (requestSection) requestSection.classList.add('is-hidden');
            if (successSection) successSection.classList.add('is-hidden');
            if (confirmSection) confirmSection.classList.remove('is-hidden');
            if (cancelBtn) cancelBtn.classList.remove('is-hidden');
            if (closeBtn) closeBtn.classList.add('is-hidden');
            if (requestBtn) requestBtn.classList.add('is-hidden');
            if (confirmBtn) confirmBtn.classList.remove('is-hidden');
            
            // Focus on the new password input
            setTimeout(() => {
                document.getElementById('passwordResetNewPassword')?.focus();
            }, 100);
            
            // Remove token from URL bar for a bit of shoulder-surfing protection
            history.replaceState(
                null,
                document.title,
                window.location.pathname + window.location.search,
            );
        }
    } catch (e) {
        console.warn('Failed to process reset-token from URL hash', e);
    }
    
    // Hover behavior for character cards:
    // - Adds/removes a visual `is-hovered`class
const characterGrid=document.getElementById('characterGrid');if(characterGrid){characterGrid.addEventListener('mouseover',(e)=>{const card=e.target.closest('.character-card');document.querySelectorAll('.character-card.is-hovered').forEach(el=>{if(el!==card){el.classList.remove('is-hovered');}});if(card){card.classList.add('is-hovered');if(typeof KeyboardNav!=='undefined'&&KeyboardNav.clearAll){KeyboardNav.clearAll();}}});characterGrid.addEventListener('mouseleave',()=>{document.querySelectorAll('.character-card.is-hovered').forEach(el=>{el.classList.remove('is-hovered');});});}
window.addEventListener('keydown',(e)=>{if(splashActive)return;const openModal=document.querySelector('.modal.show');if(openModal){const modalId=openModal.id;if(e.key==='Escape'){e.preventDefault();const discardOverlay=openModal.querySelector('.modal-discard-confirm.show');if(discardOverlay){discardOverlay.classList.remove('show');return;}
ModalManager.requestClose(modalId);return;}
if(e.key==='Enter'&&e.metaKey){const primaryBtn=openModal.querySelector('.modal-footer .terminal-btn-primary');if(primaryBtn&&!primaryBtn.disabled){e.preventDefault();primaryBtn.click();}
return;}
return;}
const inFormElement=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA'||document.activeElement.tagName==='SELECT');if(inFormElement){if(e.key==='Escape'){e.preventDefault();document.activeElement.blur();KeyboardNav.focusFirstCard();}
return;}
if(e.key==='/'||(e.key==='f'&&e.ctrlKey)){e.preventDefault();KeyboardNav.focusSearch();}else if(e.key==='ArrowUp'){e.preventDefault();KeyboardNav.moveUp();}else if(e.key==='ArrowDown'){e.preventDefault();KeyboardNav.moveDown();}else if(e.key==='ArrowLeft'){e.preventDefault();KeyboardNav.moveLeft();}else if(e.key==='ArrowRight'){e.preventDefault();KeyboardNav.moveRight();}else if(e.key==='Enter'){e.preventDefault();KeyboardNav.select();}});});