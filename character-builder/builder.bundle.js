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
this._handleSessionExpired();}else if(DEBUG){console.log('[AuthService] Session still valid');}}catch(error){console.warn('[AuthService] Session check failed (network?):',error);}},_handleSessionExpired(){this.stopSessionMonitor();this.clearToken();const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'token_expired'},});window.dispatchEvent(event);if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}},});})(window);(function(global){const Mapper={fromBuilderToBackend(character){if(!character)return null;return{name:character.name||'',race:character.race||'',character_class:character.class||'',level:character.level||1,background:character.background||null,alignment:this._mapAlignmentFromBuilder(character.alignment),experience_points:character.experiencePoints||0,strength:character.abilities?.str||10,dexterity:character.abilities?.dex||10,constitution:character.abilities?.con||10,intelligence:character.abilities?.int||10,wisdom:character.abilities?.wis||10,charisma:character.abilities?.cha||10,hit_points_max:character.hitPoints||10,hit_points_current:character.hitPoints||10,hit_points_temp:0,armor_class:this._calculateACFromBuilder(character),initiative:this._calculateInitiativeFromBuilder(character),speed:this._getSpeedFromBuilder(character),hit_dice_current:character.hitDiceCurrent??null,class_resources:character.classResources||{},death_save_successes:0,death_save_failures:0,saving_throw_proficiencies:character.savingThrows||[],skill_proficiencies:character.skillProficiencies||[],skill_expertises:[],tool_proficiencies:character.toolProficiencies||[],languages:character.languages||[],racial_traits:this._arrayToDict(character.racialTraits),class_features:this._arrayToDict(character.classFeatures),feats:[],background_feature:character.backgroundFeature||{},personality_traits:character.personalityTrait||null,ideals:character.ideal||null,bonds:character.bond||null,flaws:character.flaw||null,appearance:character.appearance||null,backstory:character.backstory||null,sex:character.sex||null,ascii_portrait:character.asciiPortrait||null,original_portrait_url:character.originalPortraitUrl||null,custom_portrait_ascii:character.customPortraitAscii||null,custom_portrait_count:character.customPortraitCount||0,portrait_metadata:character.portraitMetadata||{},inventory:this._arrayToDict(character.equipment),spellcasting_ability:character.spellcastingAbility||null,spell_save_dc:character.spellSaveDC||null,spell_attack_bonus:character.spellAttackBonus||null,spell_slots:character.spellSlots||{},spell_slots_used:{},cantrips:this._spellsToStringArray(character.cantrips),spells_known:this._spellsToStringArray(character.spellsKnown),spells_prepared:this._spellsToStringArray(character.spellsPrepared),conditions:[],attacks:this._arrayToDict(character.attacks),copper_pieces:character.copper||0,silver_pieces:character.silver||0,electrum_pieces:character.electrum||0,gold_pieces:character.gold||0,platinum_pieces:character.platinum||0,campaign_id:character.campaignId||null,};},fromBackendToBuilder(backendChar){if(!backendChar)return null;return{id:backendChar.id,name:backendChar.name,race:backendChar.race,class:backendChar.character_class,level:backendChar.level,background:backendChar.background,alignment:this._mapAlignmentFromBackend(backendChar.alignment),experiencePoints:backendChar.experience_points,abilities:{str:backendChar.strength,dex:backendChar.dexterity,con:backendChar.constitution,int:backendChar.intelligence,wis:backendChar.wisdom,cha:backendChar.charisma,},hitPoints:backendChar.hit_points_max,currentHitPoints:backendChar.hit_points_current,armorClass:backendChar.armor_class,initiative:backendChar.initiative,speed:backendChar.speed,hitDiceCurrent:backendChar.hit_dice_current,classResources:backendChar.class_resources||{},savingThrows:backendChar.saving_throw_proficiencies,skillProficiencies:backendChar.skill_proficiencies,toolProficiencies:backendChar.tool_proficiencies,languages:backendChar.languages,racialTraits:backendChar.racial_traits,classFeatures:backendChar.class_features,backgroundFeature:backendChar.background_feature,personalityTrait:backendChar.personality_traits,ideal:backendChar.ideals,bond:backendChar.bonds,flaw:backendChar.flaws,appearance:backendChar.appearance,backstory:backendChar.backstory,sex:backendChar.sex||null,asciiPortrait:backendChar.ascii_portrait,originalPortraitUrl:backendChar.original_portrait_url,customPortraitAscii:backendChar.custom_portrait_ascii,customPortraitCount:backendChar.custom_portrait_count,portraitMetadata:backendChar.portrait_metadata,equipment:backendChar.inventory,spellcastingAbility:backendChar.spellcasting_ability,spellSaveDC:backendChar.spell_save_dc,spellAttackBonus:backendChar.spell_attack_bonus,spellSlots:backendChar.spell_slots,cantrips:backendChar.cantrips||[],spellsKnown:backendChar.spells_known||[],spellsPrepared:backendChar.spells_prepared||[],attacks:backendChar.attacks,copper:backendChar.copper_pieces,silver:backendChar.silver_pieces,electrum:backendChar.electrum_pieces,gold:backendChar.gold_pieces,platinum:backendChar.platinum_pieces,campaignId:backendChar.campaign_id,ownerId:backendChar.owner_id,_backendData:backendChar,};},fromManagerToBackend(character){if(!character)return null;const rawBackgroundFeature=character.backgroundFeature||character.backgroundData?.feature||{};const backgroundFeatureDict=typeof rawBackgroundFeature==='string'?{name:rawBackgroundFeature}:rawBackgroundFeature;return{name:character.name||'Unnamed Character',race:character.race||character.raceData?.name||'Human',character_class:character.class||character.classData?.name||'Fighter',level:character.level||1,background:character.background||character.backgroundData?.name||null,alignment:this._mapAlignmentFromManager(character.alignment),experience_points:character.experiencePoints||0,strength:character.abilities?.str||character.abilityScores?.str||10,dexterity:character.abilities?.dex||character.abilityScores?.dex||10,constitution:character.abilities?.con||character.abilityScores?.con||10,intelligence:character.abilities?.int||character.abilityScores?.int||10,wisdom:character.abilities?.wis||character.abilityScores?.wis||10,charisma:character.abilities?.cha||character.abilityScores?.cha||10,hit_points_max:character.hitPoints?.max||character.hitPoints||10,hit_points_current:character.hitPoints?.current||character.hitPoints?.max||character.hitPoints||10,hit_points_temp:character.hitPoints?.temp||0,armor_class:character.armorClass||10,initiative:character.initiative||0,speed:character.speed||30,hit_dice_current:character.hitDiceCurrent??null,class_resources:character.classResources||{},death_save_successes:character.deathSaves?.successes||0,death_save_failures:character.deathSaves?.failures||0,saving_throw_proficiencies:character.savingThrows||[],skill_proficiencies:character.skillProficiencies||[],skill_expertises:character.skillExpertises||[],tool_proficiencies:character.toolProficiencies||[],languages:character.languages||[],racial_traits:this._arrayToDict(character.racialTraits||character.raceData?.traits||[],),class_features:this._arrayToDict(character.classFeatures||character.classData?.features||[],),feats:this._arrayToDict(character.feats||[]),background_feature:backgroundFeatureDict,personality_traits:character.personalityTraits||character.personalityTrait||null,ideals:character.ideals||null,bonds:character.bonds||null,flaws:character.flaws||null,appearance:character.appearance||null,backstory:character.backstory||null,sex:character.sex||null,ascii_portrait:character.asciiPortrait||null,original_portrait_url:character.originalPortraitUrl||null,custom_portrait_ascii:character.customPortraitAscii||null,custom_portrait_count:character.customPortraitCount||0,portrait_metadata:character.portraitMetadata||{},inventory:(character.equipment||character.inventory||[]).map((item)=>typeof item==='string'?{name:item}:item,),spellcasting_ability:character.spellcastingAbility||null,spell_save_dc:character.spellSaveDC||null,spell_attack_bonus:character.spellAttackBonus||null,spell_slots:character.spellSlots||{},spell_slots_used:character.spellSlotsUsed||{},cantrips:this._spellsToStringArray(character.cantrips||[]),spells_known:this._spellsToStringArray(character.spellsKnown||[]),spells_prepared:this._spellsToStringArray(character.spellsPrepared||[]),conditions:character.conditions||[],attacks:character.attacks||[],copper_pieces:character.currency?.cp??character.copper??0,silver_pieces:character.currency?.sp??character.silver??0,electrum_pieces:character.currency?.ep??character.electrum??0,gold_pieces:character.currency?.gp??character.gold??0,platinum_pieces:character.currency?.pp??character.platinum??0,campaign_id:character.campaignId||null,};},fromBackendToManager(apiChar){if(!apiChar)return null;return{id:apiChar.id.toString(),name:apiChar.name,race:apiChar.race,class:apiChar.character_class,level:apiChar.level,background:apiChar.background,alignment:this._mapAlignmentFromBackend(apiChar.alignment),experiencePoints:apiChar.experience_points,abilities:{str:apiChar.strength,dex:apiChar.dexterity,con:apiChar.constitution,int:apiChar.intelligence,wis:apiChar.wisdom,cha:apiChar.charisma,},hitPoints:{max:apiChar.hit_points_max,current:apiChar.hit_points_current,temp:apiChar.hit_points_temp,},armorClass:apiChar.armor_class,initiative:apiChar.initiative,speed:apiChar.speed,hitDiceCurrent:apiChar.hit_dice_current,hitDiceMax:apiChar.level||1,classResources:apiChar.class_resources||{},savingThrows:apiChar.saving_throw_proficiencies,skillProficiencies:apiChar.skill_proficiencies,skillExpertises:apiChar.skill_expertises,toolProficiencies:apiChar.tool_proficiencies,languages:apiChar.languages,racialTraits:apiChar.racial_traits,classFeatures:apiChar.class_features,feats:apiChar.feats,backgroundFeature:apiChar.background_feature,personalityTraits:apiChar.personality_traits,ideals:apiChar.ideals,bonds:apiChar.bonds,flaws:apiChar.flaws,appearance:apiChar.appearance,backstory:apiChar.backstory,sex:apiChar.sex||null,equipment:apiChar.inventory.map((item)=>typeof item==='object'&&item.name?item.name:item,),spellcastingAbility:apiChar.spellcasting_ability,spellSaveDC:apiChar.spell_save_dc,spellAttackBonus:apiChar.spell_attack_bonus,spellSlots:apiChar.spell_slots,spellSlotsUsed:apiChar.spell_slots_used,cantrips:apiChar.cantrips||[],spellsKnown:apiChar.spells_known||[],spellsPrepared:apiChar.spells_prepared||[],conditions:apiChar.conditions,attacks:apiChar.attacks,currency:{cp:apiChar.copper_pieces,sp:apiChar.silver_pieces,ep:apiChar.electrum_pieces,gp:apiChar.gold_pieces,pp:apiChar.platinum_pieces,},campaignId:apiChar.campaign_id,ownerId:apiChar.owner_id,createdAt:apiChar.created_at,updatedAt:apiChar.updated_at,asciiPortrait:apiChar.ascii_portrait,originalPortraitUrl:apiChar.original_portrait_url,customPortraitAscii:apiChar.custom_portrait_ascii,customPortraitCount:apiChar.custom_portrait_count||0,portraitMetadata:apiChar.portrait_metadata||{},};},_arrayToDict(arr){if(!arr||!Array.isArray(arr))return[];return arr.map((item)=>{if(typeof item==='object'&&item!==null)return item;if(typeof item==='string')return{name:item};return{value:item};});},_spellsToStringArray(arr){if(!arr||!Array.isArray(arr))return[];return arr.map((item)=>{if(typeof item==='object'&&item!==null&&item.name)return item.name;if(typeof item==='string')return item;return String(item);});},_mapAlignmentFromBuilder(alignment){if(!alignment)return null;const map={'lg':'lawful_good','ng':'neutral_good','cg':'chaotic_good','ln':'lawful_neutral','n':'true_neutral','cn':'chaotic_neutral','le':'lawful_evil','ne':'neutral_evil','ce':'chaotic_evil','Lawful Good':'lawful_good','Neutral Good':'neutral_good','Chaotic Good':'chaotic_good','Lawful Neutral':'lawful_neutral','True Neutral':'true_neutral','Chaotic Neutral':'chaotic_neutral','Lawful Evil':'lawful_evil','Neutral Evil':'neutral_evil','Chaotic Evil':'chaotic_evil',};return map[alignment]||null;},_mapAlignmentFromManager(alignment){return this._mapAlignmentFromBuilder(alignment);},_mapAlignmentFromBackend(backendAlignment){if(!backendAlignment)return null;const reverseMap={'lawful_good':'lg','neutral_good':'ng','chaotic_good':'cg','lawful_neutral':'ln','true_neutral':'n','chaotic_neutral':'cn','lawful_evil':'le','neutral_evil':'ne','chaotic_evil':'ce',};return reverseMap[backendAlignment]||null;},_calculateACFromBuilder(character){const dex=character.abilities?.dex;const dexMod=dex?Math.floor((dex-10)/2):0;return 10+dexMod;},_calculateInitiativeFromBuilder(character){const dex=character.abilities?.dex;return dex?Math.floor((dex-10)/2):0;},_getSpeedFromBuilder(character){const race=(character.race||'').toLowerCase();const speedMap={dwarf:25,halfling:25,gnome:25,elf:30,human:30,'half-elf':30,'half-orc':30,tiefling:30,dragonborn:30,};return speedMap[race]||30;},};global.DanddyCharacterMapper=Mapper;})(window);(function(global){const cfg=global.DanddyConfig||{};const STORAGE_KEY=cfg.CHARACTER_STORAGE_KEY||'dnd_characters';const CACHE_KEY=`${STORAGE_KEY}_cache`;const Storage={STORAGE_KEY,CACHE_KEY,readAll(){const raw=global.localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):[];},writeAll(characters){global.localStorage.setItem(STORAGE_KEY,JSON.stringify(characters||[]));},upsert(character){if(!character)return;const chars=this.readAll();const idStr=String(character.id);const idx=chars.findIndex((c)=>c&&String(c.id)===idStr);if(idx>=0){chars[idx]=character;}else{chars.push(character);}
this.writeAll(chars);},deleteById(id){const idStr=String(id);const chars=this.readAll().filter((c)=>!c||String(c.id)!==idStr);this.writeAll(chars);},readCache(){const raw=global.localStorage.getItem(CACHE_KEY);return raw?JSON.parse(raw):[];},writeCache(characters){global.localStorage.setItem(CACHE_KEY,JSON.stringify(characters||[]));},clearAll(){global.localStorage.removeItem(STORAGE_KEY);global.localStorage.removeItem(CACHE_KEY);},};global.DanddyStorage=Storage;})(window);(function(global){const DEFAULT_THEME_ID='cinematic-inks';const ADMIN_STORAGE_KEY='dnd_portrait_prompt_entries_v1';let adminCache=null;const DEFAULT_POSES={default:['standing in a confident, heroic pose','standing in a relaxed but ready stance','standing tall with one hand raised in greeting',],fighter:['standing in a battle-ready stance, weapon raised','resting a heavy weapon across their shoulder','standing guard with shield raised',],wizard:['gesturing mystically with arcane energy gathering','holding a staff aloft, channeling power','studying an ancient tome with focused concentration',],rogue:['emerging from shadows with a sly grin','perched in a ready crouch, daggers drawn','leaning casually against nothing, arms crossed',],cleric:['raising a holy symbol with radiant light','standing in peaceful prayer','blessing with an outstretched hand',],ranger:['drawing a bow with focused aim','kneeling to examine tracks on the ground','standing with a beast companion at their side',],paladin:['standing resolute with sword planted before them','raising a glowing holy weapon high','kneeling in devotion, armor gleaming',],barbarian:['roaring in battle rage, muscles tensed','wielding a massive weapon overhead','standing defiant with chest out',],bard:['strumming a lute with a charming smile','performing dramatically with flowing gestures','winking knowingly at the viewer',],druid:['communing with nature, eyes closed','shape-shifting with swirling magical energy','standing surrounded by woodland creatures',],monk:['in a focused martial arts stance','meditating in peaceful contemplation','executing a precise combat technique',],sorcerer:['crackling with innate magical energy','casting with wild, uncontrolled power','standing with elemental forces swirling around them',],warlock:['channeling dark eldritch energy','standing with patron symbols glowing nearby','invoking otherworldly power with outstretched hands',],};const DEFAULT_CAMERAS={default:['Camera angle: three-quarter view that clearly shows the character','Camera angle: dramatic low angle looking up at the character','Camera angle: portrait framing focused on upper body and face',],};let apiSyncAttempted=false;function normalize(str){return(str||'').toString().trim();}
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
return false;},});const CharacterNameData=(window.CharacterNameData={patterns:{dwarf:{first:['Thorin','Gimli','Balin','Dwalin','Thrain','Dain','Bombur','Bofur','Kili','Fili','Oin','Gloin','Bruenor','Morgran','Rurik','Einkil','Barendd','Baern','Harbek','Rumnar',],last:['Ironforge','Stonehelm','Deepdelver','Mountainheart','Goldseeker','Ironfoot','Hammerhand','Oakenshield','Battlehammer','Fireforge','Stormdelver','Stonebreaker','Coppervein','Bronzebrow','Rockseeker',],},elf:{first:['Legolas','Galadriel','Elrond','Arwen','Thranduil','Celeborn','Elessar','Elendil','Finrod','Luthien','Faelar','Aelar','Mialee','Syllin','Thia','Varis','Althaea','Enna','Nelar',],last:['Greenleaf','Starweaver','Moonwhisper','Silverbow','Nightbreeze','Sunshadow','Stormwind','Brightwood','Dawnpetal','Evenwood','Silverfrond','Nightstar','Willowshade','Starfall','Moonbrook',],},human:{first:['Aragorn','Boromir','Eowyn','Faramir','Theodred','Eomer','Eddard','Catelyn','Jon','Sansa','Alaric','Rowan','Serena','Garrick','Lysa','Marcus','Elena','Corin','Brynn',],last:['Stormborn','Blackwood','Riverrun','Ironwall','Longstrider','Stormblade','Brightshield','Greywind','Highvale','Steelguard','Duskwalker','Redcrest','Stoneward','Ashborne','Hawkspear',],},halfling:{first:['Bilbo','Frodo','Sam','Merry','Pippin','Rosie','Hamfast','Belladonna','Lobelia','Fredegar','Milo','Daisy','Rosa','Cora','Perrin','Tansy','Dodo','Seraphina','Odo',],last:['Baggins','Took','Brandybuck','Gamgee','Goodbody','Proudfoot','Burrows','Underhill','Greenhill','Fairbairn','Hilltopple','Brushgather','Tealeaf','Thorngage','Goodbarrel','Hearthcoat',],},dragonborn:{first:['Drax','Razax','Thordak','Torinn','Balasar','Kriv','Nadarr','Heskan','Shedinn','Ghesh','Arjhan','Medrash','Rhogar','Tarhun','Akra','Miirym','Sora','Vezera','Zorvath',],last:['Flameheart','Ironclaw','Stormsinger','Ashborn','Dragonfall','Firebreath','Scaleborn','Wyrmblood','Skyscale','Embermaw','Stormscale','Brightflame','Stoneclaw','Cloudsunder','Blazewing',],},gnome:{first:['Glim','Boddynock','Dimble','Fonkin','Seebo','Zook','Eldon','Brocc','Burgell','Jebeddo','Alston','Bimpnottin','Fizzik','Carlin','Nissa','Wrenn','Tavi','Ellyjobell','Zanna',],last:['Tinkertop','Sparklegem','Nimblefingers','Brightgear','Gadgetwhiz','Fizzlebang','Cogsworth','Glimmergold','Whistlewhirr','Gadgetgrind','Janglecoin','Copperbolt','Mithrilspanner','Quickwidget','Proudgear',],},'half-elf':{first:['Tanis','Raistlin','Laurana','Gilthanas','Tanthalas','Silvara','Eliana','Korrin','Faelyn','Soveliss','Ilanis','Kael','Myla','Tharos','Elira','Daeris','Rian','Caelynn','Torren',],last:['Half-Elven','Moonbrook','Starfall','Whisperwind','Shadowvale','Dawnbringer','Twilightbane','Silvermoon','Nightbloom','Duskwillow','Starcrest','Eveningfall','Shadeglade','Brightglen','Silvershade',],},'half-orc':{first:['Grognak','Throk','Ugak','Krod','Sharn','Dench','Grul','Drog','Feng','Shump','Ghorbash','Mazog','Uglar','Ruk','Karash','Vorag','Yagra','Shautha','Ovak',],last:['Ironhide','Bonecrusher','Skullsplitter','Bloodaxe','Stonefist','Grimjaw','Warbringer','Doomhammer','Boulderfist','Skullbrand','Gorefang','Bloodfury','Ironmaw','Steelgrip','Rageborn',],},tiefling:{first:['Zevlor','Raven','Damakos','Akta','Therai','Nemeia','Kallista','Leucis','Orianna','Morthos','Azazel','Seraphine','Xathos','Riven','Lyra','Caelum','Naeris','Vexria','Zheren',],last:['Hellborn','Darkflame','Shadowhorn','Nightwhisper','Embersoul','Dreadfire','Ashenborn','Voidwalker','Grimshroud','Duskwreath','Soulbrand','Cindertongue','Nightreign','Gloomsigil','Shadebinder',],},},getPattern(race){const key=(race||'').toLowerCase();return this.patterns[key]||this.patterns.human;},getRaces(){return Object.keys(this.patterns);},});window.SPELL_DATABASE={0:[{id:'acid-splash',name:'Acid Splash',school:'Conjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Hurl a bubble of acid at one or two creatures within 5 feet of each other. Each must succeed on a Dex save or take 1d6 acid damage. Scales at 5th (2d6), 11th (3d6), 17th (4d6).',tags:['damage','acid']},{id:'blade-ward',name:'Blade Ward',school:'Abjuration',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'1 round',description:'Gain resistance to bludgeoning, piercing, and slashing damage from weapon attacks until end of next turn.',tags:['defense','protection']},{id:'chill-touch',name:'Chill Touch',school:'Necromancy',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'1 round',description:'Ghostly skeletal hand deals 1d8 necrotic damage and prevents healing until your next turn. Undead also have disadvantage against you. Scales at 5th, 11th, 17th.',tags:['damage','necrotic','debuff']},{id:'dancing-lights',name:'Dancing Lights',school:'Evocation',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create up to four torch-sized lights or one glowing humanoid form. Move them up to 60 feet as a bonus action.',tags:['utility','light']},{id:'druidcraft',name:'Druidcraft',school:'Transmutation',classes:['druid'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Instantaneous',description:'Create a tiny harmless sensory effect, light or snuff a small flame, predict weather, or make a plant bloom.',tags:['utility','nature']},{id:'eldritch-blast',name:'Eldritch Blast',school:'Evocation',classes:['warlock'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Beam of crackling energy deals 1d10 force damage. Additional beams at 5th (2), 11th (3), 17th (4).',tags:['damage','force']},{id:'fire-bolt',name:'Fire Bolt',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Hurl a mote of fire at a creature or object. 1d10 fire damage on hit. Ignites flammable objects. Scales at 5th, 11th, 17th.',tags:['damage','fire']},{id:'friends',name:'Friends',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'S, M',duration:'Concentration, 1 minute',description:'Gain advantage on Charisma checks against one creature. When spell ends, creature realizes it was charmed.',tags:['social','charm']},{id:'guidance',name:'Guidance',school:'Divination',classes:['cleric','druid'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 minute',description:'Touch a willing creature. Once before the spell ends, they can add 1d4 to one ability check.',tags:['buff','support']},{id:'light',name:'Light',school:'Evocation',classes:['bard','cleric','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, M',duration:'1 hour',description:'Touch an object no larger than 10 feet. It sheds bright light in 20-foot radius and dim light for additional 20 feet.',tags:['utility','light']},{id:'mage-hand',name:'Mage Hand',school:'Conjuration',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'1 minute',description:'Create a spectral floating hand that can manipulate objects, open doors, or retrieve items up to 10 pounds.',tags:['utility','manipulation']},{id:'mending',name:'Mending',school:'Transmutation',classes:['bard','cleric','druid','sorcerer','wizard'],castingTime:'1 minute',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Repair a single break or tear in an object you touch, such as a broken chain link or torn cloak.',tags:['utility','repair']},{id:'message',name:'Message',school:'Transmutation',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'1 round',description:'Whisper a message to a creature within range. Only the target hears it and can reply in a whisper.',tags:['utility','communication']},{id:'minor-illusion',name:'Minor Illusion',school:'Illusion',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'S, M',duration:'1 minute',description:'Create a sound or image of an object no larger than a 5-foot cube. Investigation check to determine illusion.',tags:['utility','illusion','deception']},{id:'poison-spray',name:'Poison Spray',school:'Conjuration',classes:['druid','sorcerer','warlock','wizard'],castingTime:'1 action',range:'10 feet',components:'V, S',duration:'Instantaneous',description:'Project a puff of noxious gas. Target must succeed Con save or take 1d12 poison damage. Scales at 5th, 11th, 17th.',tags:['damage','poison']},{id:'prestidigitation',name:'Prestidigitation',school:'Transmutation',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'10 feet',components:'V, S',duration:'Up to 1 hour',description:'Create minor magical tricks: harmless sensory effect, light or snuff candle, clean or soil object, warm or chill material, make mark or symbol.',tags:['utility','social']},{id:'produce-flame',name:'Produce Flame',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'Self',components:'V, S',duration:'10 minutes',description:'Flickering flame appears in your hand for light or to throw. Ranged spell attack deals 1d8 fire damage. Scales at 5th, 11th, 17th.',tags:['damage','fire','utility','light']},{id:'ray-of-frost',name:'Ray of Frost',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Frigid beam of blue-white light deals 1d8 cold damage and reduces speed by 10 feet until your next turn. Scales at 5th, 11th, 17th.',tags:['damage','cold','control']},{id:'resistance',name:'Resistance',school:'Abjuration',classes:['cleric','druid'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 minute',description:'Touch a willing creature. Once before spell ends, they can add 1d4 to one saving throw.',tags:['buff','support','defense']},{id:'sacred-flame',name:'Sacred Flame',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Flame-like radiance descends on target. Dex save or take 1d8 radiant damage. No benefit from cover. Scales at 5th, 11th, 17th.',tags:['damage','radiant']},{id:'shillelagh',name:'Shillelagh',school:'Transmutation',classes:['druid'],castingTime:'1 bonus action',range:'Touch',components:'V, S, M',duration:'1 minute',description:'Club or quarterstaff becomes magical, uses spellcasting ability for attack/damage, and deals 1d8 damage.',tags:['buff','combat']},{id:'shocking-grasp',name:'Shocking Grasp',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'Lightning springs from your hand. Melee spell attack deals 1d8 lightning damage, target can\'t take reactions. Advantage vs metal armor. Scales at 5th, 11th, 17th.',tags:['damage','lightning']},{id:'spare-the-dying',name:'Spare the Dying',school:'Necromancy',classes:['cleric'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'Touch a living creature at 0 hit points. It becomes stable.',tags:['healing','support']},{id:'thaumaturgy',name:'Thaumaturgy',school:'Transmutation',classes:['cleric'],castingTime:'1 action',range:'30 feet',components:'V',duration:'Up to 1 minute',description:'Manifest minor wonder: boom your voice, flicker flames, cause tremors, create sounds, swing doors, or alter eye appearance.',tags:['utility','social']},{id:'thorn-whip',name:'Thorn Whip',school:'Transmutation',classes:['druid'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Instantaneous',description:'Create a vine-like whip. Melee spell attack deals 1d6 piercing and pulls Large or smaller creature 10 feet closer. Scales at 5th, 11th, 17th.',tags:['damage','control']},{id:'toll-the-dead',name:'Toll the Dead',school:'Necromancy',classes:['cleric','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Point at creature, dolorous bell tolls. Wis save or take 1d8 necrotic (1d12 if missing HP). Scales at 5th, 11th, 17th.',tags:['damage','necrotic']},{id:'true-strike',name:'True Strike',school:'Divination',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'S',duration:'Concentration, 1 round',description:'Gain advantage on your first attack roll against the target on your next turn.',tags:['buff','combat']},{id:'vicious-mockery',name:'Vicious Mockery',school:'Enchantment',classes:['bard'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Unleash a string of insults. Wis save or take 1d4 psychic damage and have disadvantage on next attack. Scales at 5th, 11th, 17th.',tags:['damage','psychic','debuff','social']},{id:'word-of-radiance',name:'Word of Radiance',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'5 feet',components:'V, M',duration:'Instantaneous',description:'Speak a divine word. Each creature of choice within range must make Con save or take 1d6 radiant damage. Scales at 5th, 11th, 17th.',tags:['damage','radiant','aoe']},],1:[{id:'alarm',name:'Alarm',school:'Abjuration',classes:['ranger','wizard'],castingTime:'1 minute',range:'30 feet',components:'V, S, M',duration:'8 hours',description:'Set a ward on a 20-foot cube. Alerts you (mental or audible) when a creature enters without speaking a password.',tags:['utility','detection','ritual']},{id:'animal-friendship',name:'Animal Friendship',school:'Enchantment',classes:['bard','druid','ranger'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'24 hours',description:'Charm a beast with Intelligence 3 or lower for 24 hours. Wis save negates.',tags:['charm','nature']},{id:'armor-of-agathys',name:'Armor of Agathys',school:'Abjuration',classes:['warlock'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'1 hour',description:'Gain 5 temp HP. While you have these HP, creature that hits you with melee attack takes 5 cold damage. Upcast: +5 temp HP and damage per slot level.',tags:['defense','cold','retaliation']},{id:'arms-of-hadar',name:'Arms of Hadar',school:'Conjuration',classes:['warlock'],castingTime:'1 action',range:'Self (10-foot radius)',components:'V, S',duration:'Instantaneous',description:'Tendrils of dark energy erupt from you. Each creature in 10-foot radius makes Str save or takes 2d6 necrotic and can\'t take reactions. Upcast: +1d6 per slot level.',tags:['damage','necrotic','aoe']},{id:'bane',name:'Bane',school:'Enchantment',classes:['bard','cleric'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Up to 3 creatures must make Cha save or subtract 1d4 from attack rolls and saves. Upcast: +1 target per slot level.',tags:['debuff','control']},{id:'bless',name:'Bless',school:'Enchantment',classes:['cleric','paladin'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Up to 3 creatures add 1d4 to attack rolls and saving throws. Upcast: +1 target per slot level.',tags:['buff','support']},{id:'burning-hands',name:'Burning Hands',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self (15-foot cone)',components:'V, S',duration:'Instantaneous',description:'Thin sheet of flames shoots from your fingertips. Each creature in 15-foot cone makes Dex save, taking 3d6 fire damage (half on save). Upcast: +1d6 per slot level.',tags:['damage','fire','aoe']},{id:'charm-person',name:'Charm Person',school:'Enchantment',classes:['bard','druid','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'1 hour',description:'Charm a humanoid you can see. Wis save (advantage if fighting you). Charmed creature regards you as friendly. Knows it was charmed when spell ends.',tags:['charm','social']},{id:'chromatic-orb',name:'Chromatic Orb',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'Instantaneous',description:'Hurl a 4-inch sphere of energy. Choose acid, cold, fire, lightning, poison, or thunder. Ranged spell attack deals 3d8 damage of chosen type. Upcast: +1d8 per slot level.',tags:['damage','versatile']},{id:'color-spray',name:'Color Spray',school:'Illusion',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self (15-foot cone)',components:'V, S, M',duration:'1 round',description:'Dazzling array of flashing colors springs from your hand. Roll 6d10; creatures in cone are blinded starting from lowest HP until the roll is exceeded. Upcast: +2d10 per slot level.',tags:['control','debuff']},{id:'command',name:'Command',school:'Enchantment',classes:['cleric','paladin'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Speak a one-word command (Approach, Drop, Flee, Grovel, Halt). Wis save or follow command on next turn. No effect on undead or if command is directly harmful.',tags:['control','debuff']},{id:'compelled-duel',name:'Compelled Duel',school:'Enchantment',classes:['paladin'],castingTime:'1 bonus action',range:'30 feet',components:'V',duration:'Concentration, 1 minute',description:'Compel a creature to duel you. Wis save or disadvantage on attacks against others and can\'t willingly move more than 30 feet from you.',tags:['control','combat']},{id:'comprehend-languages',name:'Comprehend Languages',school:'Divination',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'1 hour',description:'Understand the literal meaning of any spoken language you hear and written language you touch (1 minute per page).',tags:['utility','communication','ritual']},{id:'create-or-destroy-water',name:'Create or Destroy Water',school:'Transmutation',classes:['cleric','druid'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Instantaneous',description:'Create up to 10 gallons of clean water or destroy up to 10 gallons of water in a 30-foot cube. Upcast: +10 gallons per slot level.',tags:['utility']},{id:'cure-wounds',name:'Cure Wounds',school:'Evocation',classes:['bard','cleric','druid','paladin','ranger'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'Creature you touch regains 1d8 + spellcasting modifier HP. No effect on undead or constructs. Upcast: +1d8 per slot level.',tags:['healing']},{id:'detect-evil-and-good',name:'Detect Evil and Good',school:'Divination',classes:['cleric','paladin'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 10 minutes',description:'Know if aberration, celestial, elemental, fey, fiend, or undead is within 30 feet, and where it is.',tags:['detection','utility']},{id:'detect-magic',name:'Detect Magic',school:'Divination',classes:['bard','cleric','druid','paladin','ranger','sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 10 minutes',description:'Sense the presence of magic within 30 feet. See a faint aura around any visible creature or object that bears magic and learn its school.',tags:['detection','utility','ritual']},{id:'detect-poison-and-disease',name:'Detect Poison and Disease',school:'Divination',classes:['cleric','druid','paladin','ranger'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Sense the presence and location of poisons, poisonous creatures, and diseases within 30 feet.',tags:['detection','utility','ritual']},{id:'disguise-self',name:'Disguise Self',school:'Illusion',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'1 hour',description:'Make yourself look different. Change height by up to 1 foot, appear thinner/fatter/in between. Can\'t change body type. Investigation check sees through it.',tags:['illusion','utility','social']},{id:'dissonant-whispers',name:'Dissonant Whispers',school:'Enchantment',classes:['bard'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Whisper a discordant melody only one creature can hear. Wis save or take 3d6 psychic damage and immediately use reaction to move away. Upcast: +1d6 per slot level.',tags:['damage','psychic','control']},{id:'divine-favor',name:'Divine Favor',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V, S',duration:'Concentration, 1 minute',description:'Your weapon is imbued with divine energy. Until spell ends, weapon attacks deal extra 1d4 radiant damage.',tags:['buff','combat','radiant']},{id:'entangle',name:'Entangle',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'90 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Grasping weeds and vines sprout in 20-foot square. Creatures in area must make Str save or be restrained. Area is difficult terrain.',tags:['control','terrain']},{id:'expeditious-retreat',name:'Expeditious Retreat',school:'Transmutation',classes:['sorcerer','warlock','wizard'],castingTime:'1 bonus action',range:'Self',components:'V, S',duration:'Concentration, 10 minutes',description:'Take the Dash action as a bonus action on each of your turns until the spell ends.',tags:['buff','mobility']},{id:'faerie-fire',name:'Faerie Fire',school:'Evocation',classes:['bard','druid'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Concentration, 1 minute',description:'Objects in 20-foot cube are outlined in light. Creatures that fail Dex save are also outlined. Affected creatures/objects shed dim light and can\'t benefit from invisibility. Attacks against them have advantage.',tags:['buff','support','debuff']},{id:'false-life',name:'False Life',school:'Necromancy',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'1 hour',description:'Bolster yourself with a necromantic facsimile of life, gaining 1d4 + 4 temporary hit points. Upcast: +5 temp HP per slot level above 1st.',tags:['defense','buff']},{id:'feather-fall',name:'Feather Fall',school:'Transmutation',classes:['bard','sorcerer','wizard'],castingTime:'1 reaction',range:'60 feet',components:'V, M',duration:'1 minute',description:'Choose up to 5 falling creatures. A falling creature\'s rate of descent slows to 60 feet per round and takes no falling damage.',tags:['utility','protection']},{id:'find-familiar',name:'Find Familiar',school:'Conjuration',classes:['wizard'],castingTime:'1 hour',range:'10 feet',components:'V, S, M',duration:'Instantaneous',description:'Gain a spirit familiar in animal form (bat, cat, crab, frog, hawk, lizard, octopus, owl, poisonous snake, fish, rat, raven, sea horse, spider, or weasel). Can telepathically communicate, see through its eyes, deliver touch spells through it.',tags:['utility','summoning','ritual']},{id:'fog-cloud',name:'Fog Cloud',school:'Conjuration',classes:['druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 1 hour',description:'Create a 20-foot-radius sphere of fog centered on a point. Area is heavily obscured. Upcast: radius increases by 20 feet per slot level.',tags:['control','terrain']},{id:'goodberry',name:'Goodberry',school:'Transmutation',classes:['druid','ranger'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Create up to 10 berries infused with magic. Eating a berry restores 1 HP and provides enough nourishment for one day.',tags:['healing','utility']},{id:'grease',name:'Grease',school:'Conjuration',classes:['wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'1 minute',description:'Slick grease covers ground in 10-foot square. Creatures entering or starting turn there must make Dex save or fall prone. Area is difficult terrain.',tags:['control','terrain']},{id:'guiding-bolt',name:'Guiding Bolt',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'1 round',description:'Flash of light streaks toward a creature. Ranged spell attack deals 4d6 radiant damage and grants advantage on next attack against target. Upcast: +1d6 per slot level.',tags:['damage','radiant','buff']},{id:'hail-of-thorns',name:'Hail of Thorns',school:'Conjuration',classes:['ranger'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next time you hit with ranged weapon attack, thorns erupt. Target and creatures within 5 feet make Dex save, taking 1d10 piercing (half on save). Upcast: +1d10 per slot level.',tags:['damage','aoe']},{id:'healing-word',name:'Healing Word',school:'Evocation',classes:['bard','cleric','druid'],castingTime:'1 bonus action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Creature you can see regains 1d4 + spellcasting modifier HP. No effect on undead or constructs. Upcast: +1d4 per slot level.',tags:['healing','bonus-action']},{id:'hellish-rebuke',name:'Hellish Rebuke',school:'Evocation',classes:['warlock'],castingTime:'1 reaction',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Point at creature that damaged you. It must make Dex save, taking 2d10 fire damage on fail, half on success. Upcast: +1d10 per slot level.',tags:['damage','fire','reaction','retaliation']},{id:'heroism',name:'Heroism',school:'Enchantment',classes:['bard','paladin'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 minute',description:'Creature is immune to being frightened and gains temp HP equal to your spellcasting modifier at start of each turn. Upcast: +1 target per slot level.',tags:['buff','support']},{id:'hex',name:'Hex',school:'Enchantment',classes:['warlock'],castingTime:'1 bonus action',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Curse a creature. Your attacks deal extra 1d6 necrotic damage and it has disadvantage on ability checks with one chosen ability. Move curse to new creature if target drops to 0 HP. Upcast: duration increases.',tags:['damage','necrotic','debuff','curse']},{id:'hunters-mark',name:"Hunter's Mark",school:'Divination',classes:['ranger'],castingTime:'1 bonus action',range:'90 feet',components:'V',duration:'Concentration, 1 hour',description:'Mark a creature as quarry. Deal extra 1d6 damage with weapon attacks against it and have advantage on Perception and Survival checks to find it. Move mark to new creature if target drops to 0 HP. Upcast: duration increases.',tags:['damage','buff','tracking']},{id:'identify',name:'Identify',school:'Divination',classes:['bard','wizard'],castingTime:'1 minute',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Learn the properties of a magic item, whether it requires attunement, how many charges it has, and any spells affecting it.',tags:['utility','knowledge','ritual']},{id:'illusory-script',name:'Illusory Script',school:'Illusion',classes:['bard','warlock','wizard'],castingTime:'1 minute',range:'Touch',components:'S, M',duration:'10 days',description:'Write on parchment that appears normal or different to those you designate. True message visible only to you and designated creatures.',tags:['utility','illusion','ritual']},{id:'inflict-wounds',name:'Inflict Wounds',school:'Necromancy',classes:['cleric'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'Make a melee spell attack. On hit, target takes 3d10 necrotic damage. Upcast: +1d10 per slot level.',tags:['damage','necrotic']},{id:'jump',name:'Jump',school:'Transmutation',classes:['druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 minute',description:'Touch a creature. Its jump distance is tripled until the spell ends.',tags:['buff','mobility']},{id:'longstrider',name:'Longstrider',school:'Transmutation',classes:['bard','druid','ranger','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:"Touch a creature. Its speed increases by 10 feet until the spell ends. Upcast: +1 target per slot level.",tags:['buff','mobility']},{id:'mage-armor',name:'Mage Armor',school:'Abjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'8 hours',description:"Touch a willing creature who isn't wearing armor. Its base AC becomes 13 + its Dexterity modifier. Spell ends if target dons armor.",tags:['defense','buff']},{id:'magic-missile',name:'Magic Missile',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Create 3 glowing darts of magical force. Each dart hits automatically and deals 1d4+1 force damage. Can target one creature or several. Upcast: +1 dart per slot level.',tags:['damage','force','reliable']},{id:'protection-from-evil-and-good',name:'Protection from Evil and Good',school:'Abjuration',classes:['cleric','paladin','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Aberrations, celestials, elementals, fey, fiends, and undead have disadvantage on attacks against target. Target can\'t be charmed, frightened, or possessed by them.',tags:['defense','protection']},{id:'purify-food-and-drink',name:'Purify Food and Drink',school:'Transmutation',classes:['cleric','druid','paladin'],castingTime:'1 action',range:'10 feet',components:'V, S',duration:'Instantaneous',description:'All nonmagical food and drink within 5-foot-radius sphere is purified and rendered free of poison and disease.',tags:['utility','ritual']},{id:'sanctuary',name:'Sanctuary',school:'Abjuration',classes:['cleric'],castingTime:'1 bonus action',range:'30 feet',components:'V, S, M',duration:'1 minute',description:'Ward a creature. Any creature targeting warded creature with attack or harmful spell must make Wis save. On fail, must choose new target or lose the attack/spell. Ends if warded creature attacks or casts harmful spell.',tags:['defense','protection']},{id:'searing-smite',name:'Searing Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next melee weapon hit deals extra 1d6 fire damage and ignites target. Target takes 1d6 fire damage at start of each turn until it or creature uses action to extinguish. Upcast: +1d6 initial damage per slot level.',tags:['damage','fire','combat']},{id:'shield',name:'Shield',school:'Abjuration',classes:['sorcerer','wizard'],castingTime:'1 reaction',range:'Self',components:'V, S',duration:'1 round',description:'An invisible barrier of magical force appears and protects you. Until start of your next turn, you have +5 bonus to AC, including against triggering attack, and take no damage from magic missile.',tags:['defense','reaction']},{id:'shield-of-faith',name:'Shield of Faith',school:'Abjuration',classes:['cleric','paladin'],castingTime:'1 bonus action',range:'60 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'A shimmering field appears around a creature, granting +2 bonus to AC for the duration.',tags:['defense','buff']},{id:'silent-image',name:'Silent Image',school:'Illusion',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create the image of an object, creature, or phenomenon that fits within a 15-foot cube. It can seem to move but makes no sound. Investigation check to determine illusion.',tags:['illusion','utility']},{id:'sleep',name:'Sleep',school:'Enchantment',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'1 minute',description:'Roll 5d8; creatures within 20-foot radius fall unconscious starting from lowest HP until roll is exceeded. Undead and immune to charmed creatures unaffected. Upcast: +2d8 per slot level.',tags:['control','debuff']},{id:'speak-with-animals',name:'Speak with Animals',school:'Divination',classes:['bard','druid','ranger'],castingTime:'1 action',range:'Self',components:'V, S',duration:'10 minutes',description:'Gain the ability to comprehend and verbally communicate with beasts. Knowledge and awareness are limited by intelligence.',tags:['utility','communication','ritual']},{id:'tashas-hideous-laughter',name:"Tasha's Hideous Laughter",school:'Enchantment',classes:['bard','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Creature must succeed Wis save or fall prone, becoming incapacitated and unable to stand. Repeats save at end of each turn and when it takes damage.',tags:['control','debuff']},{id:'thunderous-smite',name:'Thunderous Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next melee weapon hit deals extra 2d6 thunder damage and target must succeed Str save or be pushed 10 feet and knocked prone.',tags:['damage','thunder','control']},{id:'thunderwave',name:'Thunderwave',school:'Evocation',classes:['bard','druid','sorcerer','wizard'],castingTime:'1 action',range:'Self (15-foot cube)',components:'V, S',duration:'Instantaneous',description:'Wave of thunderous force sweeps out. Creatures in 15-foot cube make Con save, taking 2d8 thunder damage and pushed 10 feet away on fail (half damage, no push on success). Unsecured objects pushed automatically. Upcast: +1d8 per slot level.',tags:['damage','thunder','aoe','control']},{id:'unseen-servant',name:'Unseen Servant',school:'Conjuration',classes:['bard','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'1 hour',description:'Create an invisible, mindless, shapeless force that performs simple tasks at your command. Has AC 10, 1 HP, Str 2.',tags:['utility','summoning','ritual']},{id:'witch-bolt',name:'Witch Bolt',school:'Evocation',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Arc of lightning connects you to target. Ranged spell attack deals 1d12 lightning damage. On subsequent turns, use action to deal 1d12 automatically while maintaining concentration. Upcast: +1d12 initial damage per slot level.',tags:['damage','lightning']},{id:'wrathful-smite',name:'Wrathful Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next melee weapon hit deals extra 1d6 psychic damage and target must make Wis save or be frightened until spell ends. Can use action to make Wis check to end fear.',tags:['damage','psychic','debuff','fear']},],2:[{id:'aid',name:'Aid',school:'Abjuration',classes:['cleric','paladin'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'8 hours',description:'Bolster up to 3 creatures with toughness. Each target\'s HP max and current HP increase by 5 for the duration. Upcast: +5 per slot level above 2nd.',tags:['buff','healing']},{id:'alter-self',name:'Alter Self',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 1 hour',description:'Assume a different form: Aquatic Adaptation (swim speed, water breathing), Change Appearance (change physical characteristics), or Natural Weapons (natural weapon dealing 1d6+Str/Dex slashing, +1 attack bonus, magical).',tags:['utility','transformation']},{id:'animal-messenger',name:'Animal Messenger',school:'Enchantment',classes:['bard','druid','ranger'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'24 hours',description:'Tiny beast delivers a message up to 25 words to a specific location and recipient you describe. Beast travels 50 miles per 24 hours (flying) or 25 miles (others). Upcast: duration doubles per slot level above 2nd.',tags:['utility','communication','ritual']},{id:'barkskin',name:'Barkskin',school:'Transmutation',classes:['druid','ranger'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Touch a willing creature. Its skin becomes bark-like and its AC can\'t be less than 16, regardless of armor.',tags:['defense','buff']},{id:'blindness-deafness',name:'Blindness/Deafness',school:'Necromancy',classes:['bard','cleric','sorcerer','wizard'],castingTime:'1 action',range:'30 feet',components:'V',duration:'1 minute',description:'Blind or deafen a creature. Con save negates. Target can repeat save at end of each turn. Upcast: +1 target per slot level above 2nd.',tags:['debuff','control']},{id:'blur',name:'Blur',school:'Illusion',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Your body becomes blurred, shifting and wavering. Creatures have disadvantage on attack rolls against you. Creatures with blindsight or truesight or that don\'t rely on sight are unaffected.',tags:['defense','illusion']},{id:'branding-smite',name:'Branding Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next weapon hit deals extra 2d6 radiant damage and target becomes visible (sheds dim light 5 ft) and can\'t become invisible while spell lasts. Upcast: +1d6 per slot level above 2nd.',tags:['damage','radiant','combat']},{id:'calm-emotions',name:'Calm Emotions',school:'Enchantment',classes:['bard','cleric'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Humanoids in 20-foot sphere make Cha save or be calmed. Choose: suppress charm/fright effects, or make hostile creatures indifferent (no longer hostile unless threatened or harmed).',tags:['control','social']},{id:'continual-flame',name:'Continual Flame',school:'Evocation',classes:['cleric','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Until dispelled',description:'Create a heatless flame equivalent to a torch on an object. The flame can be covered but not smothered or quenched.',tags:['utility','light']},{id:'darkness',name:'Darkness',school:'Evocation',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, M',duration:'Concentration, 10 minutes',description:'Create magical darkness in 15-foot radius sphere. Darkvision can\'t see through it. If cast on object, can be covered to block darkness. Light spells of 2nd level or lower are dispelled by it.',tags:['control','terrain']},{id:'darkvision',name:'Darkvision',school:'Transmutation',classes:['druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'8 hours',description:'Grant a willing creature darkvision out to 60 feet for the duration.',tags:['buff','utility']},{id:'detect-thoughts',name:'Detect Thoughts',school:'Divination',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 minute',description:'Sense presence of thinking creatures within 30 feet. Focus on one to read surface thoughts. Probe deeper with opposed Int check. Target knows if it succeeds on save.',tags:['detection','social']},{id:'enhance-ability',name:'Enhance Ability',school:'Transmutation',classes:['bard','cleric','druid','sorcerer'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Touch a creature to give it one enhancement: Bear\'s Endurance (advantage on Con checks, 2d6 temp HP), Bull\'s Strength (advantage on Str checks, double carry capacity), Cat\'s Grace, Eagle\'s Splendor, Fox\'s Cunning, or Owl\'s Wisdom. Upcast: +1 target per slot level above 2nd.',tags:['buff','utility']},{id:'enlarge-reduce',name:'Enlarge/Reduce',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Enlarge: target doubles in size, advantage on Str checks and saves, +1d4 weapon damage. Reduce: target halves in size, disadvantage on Str, -1d4 weapon damage. Con save to resist.',tags:['buff','debuff','transformation']},{id:'find-steed',name:'Find Steed',school:'Conjuration',classes:['paladin'],castingTime:'10 minutes',range:'30 feet',components:'V, S',duration:'Instantaneous',description:'Summon a spirit in form of warhorse, pony, camel, elk, or mastiff. Mount has Int 6, understands one language, and you share telepathic bond. Spells targeting only you can also target mount.',tags:['summoning','utility']},{id:'find-traps',name:'Find Traps',school:'Divination',classes:['cleric','druid','ranger'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Sense the presence of any trap within line of sight and within range. You learn the general nature of the danger posed by each trap but not its location.',tags:['detection','utility']},{id:'flame-blade',name:'Flame Blade',school:'Evocation',classes:['druid'],castingTime:'1 bonus action',range:'Self',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create a fiery blade of flame in your free hand. Melee spell attack deals 3d6 fire damage on hit. As bonus action, re-evoke blade if dropped. Sheds bright light 10 ft, dim 10 ft. Upcast: +1d6 per 2 slot levels above 2nd.',tags:['damage','fire','combat']},{id:'flaming-sphere',name:'Flaming Sphere',school:'Conjuration',classes:['druid','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create a 5-foot diameter sphere of fire. Creatures ending turn within 5 feet make Dex save, taking 2d6 fire damage on fail (half on success). As bonus action, move sphere up to 30 feet. Ignites flammable objects. Upcast: +1d6 per slot level above 2nd.',tags:['damage','fire','control']},{id:'gentle-repose',name:'Gentle Repose',school:'Necromancy',classes:['cleric','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'10 days',description:'Touch a corpse. It is protected from decay and can\'t become undead. Days spent under spell don\'t count against resurrection time limits.',tags:['utility','ritual']},{id:'gust-of-wind',name:'Gust of Wind',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'Self (60-foot line)',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create 60-foot long, 10-foot wide line of strong wind. Creatures starting turn in line must succeed Str save or be pushed 15 feet. Any creature in line must spend 2 feet of movement per foot moved toward you. Disperses gas/vapor, extinguishes open flames.',tags:['control','terrain']},{id:'heat-metal',name:'Heat Metal',school:'Transmutation',classes:['bard','druid'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Choose manufactured metal object. Creatures in contact take 2d8 fire damage. If holding object, must make Con save or drop it. If can\'t drop (armor), disadvantage on attacks and ability checks until start of your next turn. Can reactivate each turn as bonus action. Upcast: +1d8 per slot level above 2nd.',tags:['damage','fire','debuff']},{id:'hold-person',name:'Hold Person',school:'Enchantment',classes:['bard','cleric','druid','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Target humanoid must succeed Wis save or be paralyzed. Target repeats save at end of each turn. Upcast: +1 target per slot level above 2nd.',tags:['control','debuff']},{id:'invisibility',name:'Invisibility',school:'Illusion',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Creature you touch becomes invisible until spell ends. Anything target wears or carries is also invisible. Spell ends if target attacks or casts a spell. Upcast: +1 target per slot level above 2nd.',tags:['utility','stealth']},{id:'knock',name:'Knock',school:'Transmutation',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Choose an object that is locked. It becomes unlocked (mundane locks) or suppressed for 10 minutes (magical locks like arcane lock). Object is heard from up to 300 feet away.',tags:['utility']},{id:'lesser-restoration',name:'Lesser Restoration',school:'Abjuration',classes:['bard','cleric','druid','paladin','ranger'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'Touch a creature and end one disease or one condition afflicting it: blinded, deafened, paralyzed, or poisoned.',tags:['healing','restoration']},{id:'levitate',name:'Levitate',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'One creature or object rises vertically up to 20 feet and remains suspended. Target can move only by pushing/pulling fixed objects. Unwilling creature makes Con save. Can change altitude up to 20 feet per turn.',tags:['control','utility']},{id:'locate-animals-or-plants',name:'Locate Animals or Plants',school:'Divination',classes:['bard','druid','ranger'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Instantaneous',description:'Name a specific kind of beast or plant. Learn direction and distance to closest one within 5 miles.',tags:['detection','nature','ritual']},{id:'locate-object',name:'Locate Object',school:'Divination',classes:['bard','cleric','druid','paladin','ranger','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Sense direction to an object you\'re familiar with or describe in detail, if within 1,000 feet. Can locate nearest of a general type. Can\'t locate if running water separates you.',tags:['detection','utility']},{id:'magic-mouth',name:'Magic Mouth',school:'Illusion',classes:['bard','wizard'],castingTime:'1 minute',range:'30 feet',components:'V, S, M',duration:'Until dispelled',description:'Implant a message of 25 words or less into an object. When triggered by conditions you set, a mouth appears and delivers the message in your voice.',tags:['utility','communication','ritual']},{id:'magic-weapon',name:'Magic Weapon',school:'Transmutation',classes:['paladin','wizard'],castingTime:'1 bonus action',range:'Touch',components:'V, S',duration:'Concentration, 1 hour',description:'Touch a nonmagical weapon. It becomes magical with +1 bonus to attack rolls and damage rolls. Upcast: +2 at 4th level, +3 at 6th level.',tags:['buff','combat']},{id:'mirror-image',name:'Mirror Image',school:'Illusion',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'1 minute',description:'Create 3 illusory duplicates. When attacked, roll d20 to determine if attack targets duplicate instead (11+ with 3 duplicates, 8+ with 2, 6+ with 1). Duplicate has AC 10 + Dex modifier and disappears when hit.',tags:['defense','illusion']},{id:'misty-step',name:'Misty Step',school:'Conjuration',classes:['sorcerer','warlock','wizard'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Instantaneous',description:'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.',tags:['mobility','teleportation']},{id:'moonbeam',name:'Moonbeam',school:'Evocation',classes:['druid'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create 5-foot radius, 40-foot high cylinder of pale light. Creature entering or starting turn in area makes Con save, taking 2d10 radiant damage on fail (half on success). Shapechangers have disadvantage and revert if they fail. Move beam 60 feet as action. Upcast: +1d10 per slot level above 2nd.',tags:['damage','radiant','control']},{id:'pass-without-trace',name:'Pass without Trace',school:'Abjuration',classes:['druid','ranger'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 hour',description:'You and creatures within 30 feet gain +10 to Stealth checks and can\'t be tracked by nonmagical means (unless you choose to leave a trail).',tags:['stealth','utility']},{id:'prayer-of-healing',name:'Prayer of Healing',school:'Evocation',classes:['cleric'],castingTime:'10 minutes',range:'30 feet',components:'V',duration:'Instantaneous',description:'Up to 6 creatures regain 2d8 + spellcasting modifier HP. No effect on undead or constructs. Upcast: +1d8 per slot level above 2nd.',tags:['healing']},{id:'protection-from-poison',name:'Protection from Poison',school:'Abjuration',classes:['cleric','druid','paladin','ranger'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'1 hour',description:'Neutralize one poison affecting target. Target has advantage on saves against poison and resistance to poison damage.',tags:['defense','protection']},{id:'ray-of-enfeeblement',name:'Ray of Enfeeblement',school:'Necromancy',classes:['warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Black beam of enervating energy. Ranged spell attack; on hit, target deals only half damage with weapon attacks using Strength. Target makes Con save at end of each turn to end effect.',tags:['debuff']},{id:'rope-trick',name:'Rope Trick',school:'Transmutation',classes:['wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Touch a rope up to 60 feet long. One end rises into the air and an invisible entrance to extradimensional space opens at the top. Space holds up to 8 Medium creatures. Rope can be pulled up. Attacks and spells can\'t cross into or out of space.',tags:['utility','exploration']},{id:'scorching-ray',name:'Scorching Ray',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Create 3 rays of fire. Make ranged spell attack for each ray. Each ray deals 2d6 fire damage on hit. Can target one creature or several. Upcast: +1 ray per slot level above 2nd.',tags:['damage','fire']},{id:'see-invisibility',name:'See Invisibility',school:'Divination',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'1 hour',description:'See invisible creatures and objects as if visible. Also see into the Ethereal Plane.',tags:['detection','utility']},{id:'shatter',name:'Shatter',school:'Evocation',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Instantaneous',description:'Painfully intense ringing in 10-foot radius sphere. Creatures make Con save, taking 3d8 thunder damage on fail (half on success). Creatures made of inorganic material have disadvantage. Nonmagical objects take damage automatically. Upcast: +1d8 per slot level above 2nd.',tags:['damage','thunder','aoe']},{id:'silence',name:'Silence',school:'Illusion',classes:['bard','cleric','ranger'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Create 20-foot-radius sphere of silence. No sound can be created within or pass through. Creatures inside are immune to thunder damage and deafened. Spells with verbal components can\'t be cast.',tags:['control','terrain','ritual']},{id:'spider-climb',name:'Spider Climb',school:'Transmutation',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Until the spell ends, one willing creature you touch gains the ability to move up, down, and across vertical surfaces and upside down along ceilings, while leaving its hands free. It also gains a climbing speed equal to its walking speed.',tags:['mobility','utility']},{id:'spike-growth',name:'Spike Growth',school:'Transmutation',classes:['druid','ranger'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Ground in 20-foot radius sprouts hard spikes and thorns. Entering or moving through area costs 4 feet per foot moved and deals 2d4 piercing damage per 5 feet moved. Area is difficult terrain. Perception check to recognize hazard.',tags:['control','terrain','damage']},{id:'spiritual-weapon',name:'Spiritual Weapon',school:'Evocation',classes:['cleric'],castingTime:'1 bonus action',range:'60 feet',components:'V, S',duration:'1 minute',description:'Create a floating, spectral weapon. Make melee spell attack against creature within 5 feet of weapon, dealing 1d8 + spellcasting modifier force damage. As bonus action, move weapon 20 feet and repeat attack. Upcast: +1d8 per 2 slot levels above 2nd.',tags:['damage','force','combat']},{id:'suggestion',name:'Suggestion',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, M',duration:'Concentration, 8 hours',description:'Suggest a course of activity (limited to a sentence or two) to a creature you can see. Sounds reasonable to target. Wis save negates. Target pursues course of action to best of ability. Ends if trigger condition causes activity to be completed.',tags:['charm','control','social']},{id:'warding-bond',name:'Warding Bond',school:'Abjuration',classes:['cleric'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Create a ward between you and one creature (requires pair of platinum rings). Target gains +1 AC, +1 saves, and resistance to all damage. When it takes damage, you take the same amount.',tags:['defense','protection']},{id:'web',name:'Web',school:'Conjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Fill 20-foot cube with thick, sticky webbing. Difficult terrain, lightly obscures. Creatures starting turn in webs or entering them must make Dex save or be restrained. Restrained creature can use action to make Str check to free itself. Webs are flammable; 5-foot cube burns away in 1 round, dealing 2d4 fire damage to any creature that starts turn in fire.',tags:['control','terrain']},{id:'zone-of-truth',name:'Zone of Truth',school:'Enchantment',classes:['bard','cleric','paladin'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'10 minutes',description:'Create 15-foot-radius sphere where creatures can\'t deliberately lie. Cha save to avoid effect (you know if they succeed). Affected creatures are aware of spell and can be evasive or refuse to answer.',tags:['social','detection']},],3:[{id:'animate-dead',name:'Animate Dead',school:'Necromancy',classes:['cleric','wizard'],castingTime:'1 minute',range:'10 feet',components:'V, S, M',duration:'Instantaneous',description:'Create an undead servant from a corpse. Target a pile of bones or corpse of a Medium or Small humanoid. It becomes a skeleton or zombie under your control for 24 hours. Upcast: +2 undead per slot level above 3rd.',tags:['summoning','necromancy']},{id:'aura-of-vitality',name:'Aura of Vitality',school:'Evocation',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Concentration, 1 minute',description:'Healing energy radiates from you. As a bonus action, cause one creature in the aura to regain 2d6 HP.',tags:['healing','aoe']},{id:'beacon-of-hope',name:'Beacon of Hope',school:'Abjuration',classes:['cleric'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Choose any number of creatures within range. They have advantage on Wisdom saves and death saves, and regain max HP from any healing.',tags:['buff','healing','support']},{id:'bestow-curse',name:'Bestow Curse',school:'Necromancy',classes:['bard','cleric','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 minute',description:'Touch a creature. Wis save or be cursed. Choose: disadvantage on checks/saves with one ability, disadvantage on attacks against you, Wis save each turn or lose action, your attacks deal extra 1d8 necrotic. Upcast: duration extends (8 hours at 4th, 24 hours at 5th, until dispelled at 7th+).',tags:['debuff','curse']},{id:'blinding-smite',name:'Blinding Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next weapon hit deals extra 3d8 radiant damage and target must make Con save or be blinded until spell ends. Target can repeat save at end of each turn.',tags:['damage','radiant','debuff']},{id:'call-lightning',name:'Call Lightning',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Create a storm cloud 100 feet above you. Call down a bolt of lightning, dealing 3d10 lightning damage (Dex half) in 5-foot radius. Can call lightning each turn as action. +1d10 if already stormy. Upcast: +1d10 per slot level above 3rd.',tags:['damage','lightning','aoe']},{id:'clairvoyance',name:'Clairvoyance',school:'Divination',classes:['bard','cleric','sorcerer','wizard'],castingTime:'10 minutes',range:'1 mile',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create an invisible sensor at a location you have seen or an obvious one you haven\'t. You can see or hear (not both) through the sensor. Switch senses as action.',tags:['detection','utility']},{id:'conjure-animals',name:'Conjure Animals',school:'Conjuration',classes:['druid','ranger'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 hour',description:'Summon fey spirits as beasts. Choose: one CR 2 beast, two CR 1 beasts, four CR 1/2 beasts, or eight CR 1/4 beasts. They obey your commands. Upcast: doubles at 5th, 7th, 9th.',tags:['summoning','nature']},{id:'counterspell',name:'Counterspell',school:'Abjuration',classes:['sorcerer','warlock','wizard'],castingTime:'1 reaction',range:'60 feet',components:'S',duration:'Instantaneous',description:'Attempt to interrupt a creature casting a spell. If spell is 3rd level or lower, it fails. Higher levels require ability check (DC 10 + spell level). Upcast: automatically counters spells of that level or lower.',tags:['defense','reaction']},{id:'create-food-and-water',name:'Create Food and Water',school:'Conjuration',classes:['cleric','paladin'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Instantaneous',description:'Create 45 pounds of food and 30 gallons of water, enough for 15 humanoids or 5 steeds for 24 hours.',tags:['utility']},{id:'crusaders-mantle',name:"Crusader's Mantle",school:'Evocation',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Concentration, 1 minute',description:'Holy power radiates from you. Nonhostile creatures within 30 feet (including you) deal extra 1d4 radiant damage with weapon attacks.',tags:['buff','radiant','aoe']},{id:'daylight',name:'Daylight',school:'Evocation',classes:['cleric','druid','paladin','ranger','sorcerer'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'1 hour',description:'Create 60-foot sphere of bright light and 60-foot dim light beyond that. If cast on object, can be covered. Dispels darkness spells of 3rd level or lower that overlap it.',tags:['utility','light']},{id:'dispel-magic',name:'Dispel Magic',school:'Abjuration',classes:['bard','cleric','druid','paladin','sorcerer','warlock','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Choose creature, object, or magical effect within range. Any spell of 3rd level or lower ends. For higher level spells, make ability check (DC 10 + spell level). Upcast: automatically ends spells of that level or lower.',tags:['utility']},{id:'elemental-weapon',name:'Elemental Weapon',school:'Transmutation',classes:['paladin'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 hour',description:'Touch a nonmagical weapon. It becomes magical with +1 to attack and deals +1d4 damage of acid, cold, fire, lightning, or thunder (your choice). Upcast: +2/+2d4 at 5th, +3/+3d4 at 7th.',tags:['buff','combat']},{id:'fear',name:'Fear',school:'Illusion',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self (30-foot cone)',components:'V, S, M',duration:'Concentration, 1 minute',description:'Project a phantasmal image of your worst fears. Each creature in 30-foot cone must make Wis save or drop what it\'s holding and become frightened. Frightened creatures must Dash away from you. Repeat save at end of turn if it can\'t see you.',tags:['control','debuff','fear']},{id:'feign-death',name:'Feign Death',school:'Necromancy',classes:['bard','cleric','druid','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Touch a willing creature and put it in a cataleptic state indistinguishable from death. Target is blinded and incapacitated, speed drops to 0, resistance to all damage except psychic. Disease and poison suspended.',tags:['utility','ritual']},{id:'fireball',name:'Fireball',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Instantaneous',description:'A bright streak flashes from your finger to a point you choose, then blossoms into an explosion of flame. Each creature in 20-foot sphere makes Dex save, taking 8d6 fire damage on fail (half on success). Ignites flammable objects. Upcast: +1d6 per slot level above 3rd.',tags:['damage','fire','aoe']},{id:'fly',name:'Fly',school:'Transmutation',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Touch a willing creature. Target gains flying speed of 60 feet. When spell ends, target falls if still aloft. Upcast: +1 target per slot level above 3rd.',tags:['mobility','buff']},{id:'gaseous-form',name:'Gaseous Form',school:'Transmutation',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Transform a willing creature into a misty cloud. Flying speed 10 feet, can pass through small holes, advantage on Str/Dex/Con saves, resistance to nonmagical damage. Can\'t attack or cast spells.',tags:['utility','transformation']},{id:'glyph-of-warding',name:'Glyph of Warding',school:'Abjuration',classes:['bard','cleric','wizard'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Until dispelled or triggered',description:'Inscribe a glyph that harms creatures that trigger it. Choose explosive runes (5d8 acid, cold, fire, lightning, or thunder; Dex half) or spell glyph (stores a spell up to 3rd level that targets triggering creature). Upcast: explosive adds 1d8 per slot level, spell can be of slot level used.',tags:['damage','trap']},{id:'haste',name:'Haste',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Target\'s speed is doubled, +2 AC, advantage on Dex saves, and additional action each turn (Attack with one weapon, Dash, Disengage, Hide, or Use Object only). When spell ends, target can\'t move or take actions until after its next turn.',tags:['buff','combat']},{id:'hypnotic-pattern',name:'Hypnotic Pattern',school:'Illusion',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'120 feet',components:'S, M',duration:'Concentration, 1 minute',description:'Create a twisting pattern of colors in a 30-foot cube. Creatures that see it must make Wis save or be charmed (incapacitated, speed 0). Effect ends for creature if it takes damage or another creature uses action to shake it.',tags:['control','debuff']},{id:'leomund-tiny-hut',name:"Leomund's Tiny Hut",school:'Evocation',classes:['bard','wizard'],castingTime:'1 minute',range:'Self (10-foot-radius hemisphere)',components:'V, S, M',duration:'8 hours',description:'Create a dome of force around and above you. Nine creatures of Medium size or smaller can fit. Creatures and objects inside when cast can move freely. Spells can\'t be cast through it. Climate is comfortable inside.',tags:['utility','protection','ritual']},{id:'lightning-bolt',name:'Lightning Bolt',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self (100-foot line)',components:'V, S, M',duration:'Instantaneous',description:'A stroke of lightning forming a 100-foot long, 5-foot wide line blasts out from you. Each creature in the line makes Dex save, taking 8d6 lightning damage on fail (half on success). Ignites flammable objects. Upcast: +1d6 per slot level above 3rd.',tags:['damage','lightning','aoe']},{id:'magic-circle',name:'Magic Circle',school:'Abjuration',classes:['cleric','paladin','warlock','wizard'],castingTime:'1 minute',range:'10 feet',components:'V, S, M',duration:'1 hour',description:'Create 10-foot-radius, 20-foot-tall cylinder of magical energy. Choose celestials, elementals, fey, fiends, or undead. Chosen type can\'t willingly enter, has disadvantage on attacks against creatures inside, and can\'t charm, frighten, or possess creatures inside. Upcast: duration increases.',tags:['protection','defense']},{id:'major-image',name:'Major Image',school:'Illusion',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create an image no larger than a 20-foot cube with sound, smell, and temperature. Can move within range. Investigation check to determine illusion. Upcast at 6th+: lasts until dispelled without concentration.',tags:['illusion','utility']},{id:'mass-healing-word',name:'Mass Healing Word',school:'Evocation',classes:['cleric'],castingTime:'1 bonus action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Up to 6 creatures you can see regain 1d4 + spellcasting modifier HP. No effect on undead or constructs. Upcast: +1d4 per slot level above 3rd.',tags:['healing','aoe']},{id:'meld-into-stone',name:'Meld into Stone',school:'Transmutation',classes:['cleric','druid'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'8 hours',description:'Step into a stone object or surface large enough to contain your body. You can\'t see what happens outside, but can hear. You can cast spells on yourself while inside. If stone is damaged, you\'re expelled and take 6d6 bludgeoning.',tags:['utility','protection','ritual']},{id:'nondetection',name:'Nondetection',school:'Abjuration',classes:['bard','ranger','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'8 hours',description:'Hide a creature or object from divination magic. Target can\'t be targeted by divination magic or perceived through magical scrying sensors.',tags:['protection','utility']},{id:'phantom-steed',name:'Phantom Steed',school:'Illusion',classes:['wizard'],castingTime:'1 minute',range:'30 feet',components:'V, S',duration:'1 hour',description:'Create a Large quasi-real horse. It has stats of a riding horse, can only be ridden by a creature you designate, and has speed 100 feet. Fades over 1 minute if spell ends.',tags:['utility','mobility','ritual']},{id:'plant-growth',name:'Plant Growth',school:'Transmutation',classes:['bard','druid','ranger'],castingTime:'1 action or 8 hours',range:'150 feet',components:'V, S',duration:'Instantaneous',description:'Action: Plants in 100-foot radius become thick and overgrown (4 feet of movement to move 1 foot). 8 hours: Enriches plants in half-mile radius, yielding twice the normal harvest for 1 year.',tags:['control','terrain','utility']},{id:'protection-from-energy',name:'Protection from Energy',school:'Abjuration',classes:['cleric','druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 hour',description:'Touch a willing creature. It has resistance to acid, cold, fire, lightning, or thunder damage (your choice) for the duration.',tags:['defense','protection']},{id:'remove-curse',name:'Remove Curse',school:'Abjuration',classes:['cleric','paladin','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Instantaneous',description:'At your touch, all curses affecting one creature or object end. If object is a cursed magic item, the curse remains but the spell breaks the owner\'s attunement so it can be removed.',tags:['restoration','utility']},{id:'revivify',name:'Revivify',school:'Necromancy',classes:['cleric','paladin'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Touch a creature that died within the last minute. It returns to life with 1 HP. Can\'t restore missing body parts. Can\'t return creatures that died of old age.',tags:['healing','resurrection']},{id:'sending',name:'Sending',school:'Evocation',classes:['bard','cleric','wizard'],castingTime:'1 action',range:'Unlimited',components:'V, S, M',duration:'Instantaneous',description:'Send a 25-word message to a creature you\'re familiar with. It hears the message, recognizes you, and can reply immediately with 25 words. Can reach any plane of existence.',tags:['communication','utility']},{id:'sleet-storm',name:'Sleet Storm',school:'Conjuration',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create 40-foot-radius, 20-foot-high cylinder of freezing rain and sleet. Ground is difficult terrain. Creature entering or starting turn in area must make Dex save or fall prone. Concentration checks for spellcasters in area.',tags:['control','terrain']},{id:'slow',name:'Slow',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Up to 6 creatures in 40-foot cube make Wis save. On fail: half speed, -2 AC and Dex saves, can\'t use reactions, can use either action or bonus action (not both), can\'t make more than one attack. Spells cast on 1-2 on d6 take effect next turn instead. Repeat save at end of each turn.',tags:['debuff','control']},{id:'speak-with-dead',name:'Speak with Dead',school:'Necromancy',classes:['bard','cleric'],castingTime:'1 action',range:'10 feet',components:'V, S, M',duration:'10 minutes',description:'Ask a corpse up to 5 questions. Corpse knows only what it knew in life, isn\'t compelled to be truthful, and answers can be cryptic. Can\'t be used on same corpse within 10 days.',tags:['utility','communication']},{id:'speak-with-plants',name:'Speak with Plants',school:'Transmutation',classes:['bard','druid','ranger'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V, S',duration:'10 minutes',description:'Imbue plants with limited sentience. They can answer questions, describe events in last day, follow simple requests like moving branches. Turn difficult terrain into normal or vice versa.',tags:['utility','communication','nature']},{id:'spirit-guardians',name:'Spirit Guardians',school:'Conjuration',classes:['cleric'],castingTime:'1 action',range:'Self (15-foot radius)',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Spirits surround you in 15-foot radius. Creatures you designate are unaffected. Others entering or starting turn in area must make Wis save, taking 3d8 radiant (good/neutral caster) or necrotic (evil caster) damage on fail (half on success). Area is difficult terrain for enemies. Upcast: +1d8 per slot level above 3rd.',tags:['damage','radiant','aoe','control']},{id:'stinking-cloud',name:'Stinking Cloud',school:'Conjuration',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create 20-foot-radius sphere of yellow, nauseating gas. Heavily obscures. Creatures starting turn in cloud must make Con save or spend action retching and reeling (can still move). Creatures immune to poison are unaffected.',tags:['control','debuff']},{id:'tongues',name:'Tongues',school:'Divination',classes:['bard','cleric','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, M',duration:'1 hour',description:'Target gains ability to understand any spoken language and speak so that any creature that knows at least one language can understand them.',tags:['utility','communication']},{id:'vampiric-touch',name:'Vampiric Touch',school:'Necromancy',classes:['warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 1 minute',description:'Your touch deals 3d6 necrotic damage (melee spell attack) and you regain HP equal to half the damage dealt. On each turn while spell lasts, you can attack again as action. Upcast: +1d6 per slot level above 3rd.',tags:['damage','necrotic','healing']},{id:'water-breathing',name:'Water Breathing',school:'Transmutation',classes:['druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'24 hours',description:'Grant up to 10 willing creatures the ability to breathe underwater until the spell ends. Creatures retain normal breathing mode.',tags:['utility','ritual']},{id:'water-walk',name:'Water Walk',school:'Transmutation',classes:['cleric','druid','ranger','sorcerer'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'1 hour',description:'Grant up to 10 willing creatures ability to walk on any liquid as if solid ground. If target is submerged, spell carries it to surface at 60 feet per round.',tags:['utility','ritual']},{id:'wind-wall',name:'Wind Wall',school:'Evocation',classes:['druid','ranger'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create wall of wind up to 50 feet long, 15 feet high, 1 foot thick. Creatures in wall make Str save or take 3d8 bludgeoning. Wall keeps fog, smoke, and small flying creatures out. Ranged weapon attacks that cross it automatically miss.',tags:['control','damage']},],4:[{id:'aura-of-life',name:'Aura of Life',school:'Abjuration',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Concentration, 10 minutes',description:'Life-preserving energy radiates from you. Nonhostile creatures in aura have resistance to necrotic damage. Nonhostile creature starting turn in aura with 0 HP regains 1 HP.',tags:['protection','healing','aoe']},{id:'aura-of-purity',name:'Aura of Purity',school:'Abjuration',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Concentration, 10 minutes',description:'Purifying energy radiates from you. Nonhostile creatures in aura can\'t become diseased, have resistance to poison damage, and advantage on saves against blinded, charmed, deafened, frightened, paralyzed, poisoned, stunned.',tags:['protection','buff','aoe']},{id:'banishment',name:'Banishment',school:'Abjuration',classes:['cleric','paladin','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Banish a creature you can see. Cha save or be sent to a harmless demiplane (native to this plane) or home plane (extraplanar, can\'t return for duration). If concentration maintained for full duration, extraplanar creatures don\'t return. Upcast: +1 target per slot level above 4th.',tags:['control','banishment']},{id:'blight',name:'Blight',school:'Necromancy',classes:['druid','sorcerer','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Instantaneous',description:'Necromantic energy washes over a creature. Con save; 8d8 necrotic damage on fail (half on success). Plants and magical plant creatures have disadvantage and take max damage. Upcast: +1d8 per slot level above 4th.',tags:['damage','necrotic']},{id:'compulsion',name:'Compulsion',school:'Enchantment',classes:['bard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Creatures of your choice within range that can hear you must make Wis save or be affected. Before each of your turns, you can designate a direction. Affected creatures must use as much movement as possible to move in that direction. They can repeat save after moving.',tags:['control','charm']},{id:'confusion',name:'Confusion',school:'Enchantment',classes:['bard','druid','sorcerer','wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Creatures in 10-foot sphere must make Wis save or be unable to take reactions and roll d10 each turn to determine behavior (1: move randomly, 2-6: no action/movement, 7-8: melee attack random adjacent creature, 9-10: act normally). Repeat save at end of turn. Upcast: +5-foot radius per slot level above 4th.',tags:['control','debuff']},{id:'conjure-minor-elementals',name:'Conjure Minor Elementals',school:'Conjuration',classes:['druid','wizard'],castingTime:'1 minute',range:'90 feet',components:'V, S',duration:'Concentration, 1 hour',description:'Summon elementals. Choose: one CR 2 elemental, two CR 1, four CR 1/2, or eight CR 1/4. They obey your verbal commands. Upcast: doubles at 6th, 8th.',tags:['summoning']},{id:'conjure-woodland-beings',name:'Conjure Woodland Beings',school:'Conjuration',classes:['druid','ranger'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Summon fey creatures. Choose: one CR 2 fey, two CR 1, four CR 1/2, or eight CR 1/4. They obey your verbal commands. Upcast: doubles at 6th, 8th.',tags:['summoning','nature']},{id:'control-water',name:'Control Water',school:'Transmutation',classes:['cleric','druid','wizard'],castingTime:'1 action',range:'300 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Control freestanding water in 100-foot cube. Choose: Flood (raise level up to 20 feet), Part Water (trench through water up to 20 feet deep), Redirect Flow (cause flowing water to move in direction you choose), or Whirlpool (25-foot vortex that deals 2d8 bludgeoning).',tags:['control','terrain']},{id:'death-ward',name:'Death Ward',school:'Abjuration',classes:['cleric','paladin'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'8 hours',description:'Touch a creature and grant it ward against death. First time target would drop to 0 HP, target drops to 1 HP instead and spell ends. Also negates first instant death effect that would kill target.',tags:['protection','defense']},{id:'dimension-door',name:'Dimension Door',school:'Conjuration',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'500 feet',components:'V',duration:'Instantaneous',description:'Teleport to a spot within range you can see, visualize, or describe. Can bring one willing creature of your size or smaller. If destination is occupied, both take 4d6 force damage.',tags:['mobility','teleportation']},{id:'divination',name:'Divination',school:'Divination',classes:['cleric'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Instantaneous',description:'Contact your deity or divine proxy. Ask a single question about a specific goal, event, or activity to occur within 7 days. GM offers truthful reply: short phrase, cryptic rhyme, or omen.',tags:['utility','knowledge','ritual']},{id:'dominate-beast',name:'Dominate Beast',school:'Enchantment',classes:['druid','sorcerer'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Charm a beast you can see. Wis save (advantage if fighting you). You have telepathic link and can command it (no action required). Can use reaction to force exact control of action. New save when it takes damage. Upcast: duration increases (1 hour at 5th, 8 hours at 6th, 24 hours at 7th+).',tags:['charm','control']},{id:'evards-black-tentacles',name:"Evard's Black Tentacles",school:'Conjuration',classes:['wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Squirming, ebony tentacles fill 20-foot square. Difficult terrain. Creature entering or starting turn there must make Dex save or take 3d6 bludgeoning and be restrained. Restrained creature can use action to make Str/Dex check to escape.',tags:['control','damage']},{id:'fabricate',name:'Fabricate',school:'Transmutation',classes:['wizard'],castingTime:'10 minutes',range:'120 feet',components:'V, S',duration:'Instantaneous',description:'Convert raw materials into finished products. Large or smaller object in 10-foot cube, or up to eight connected 5-foot cubes for larger objects. Requires proficiency with artisan\'s tools for complex objects.',tags:['utility']},{id:'fire-shield',name:'Fire Shield',school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'10 minutes',description:'Choose warm or chill shield. Warm: resistance to cold damage, creature hitting you with melee attack takes 2d8 fire. Chill: resistance to fire damage, creature hitting you takes 2d8 cold. Sheds bright light 10 feet, dim 10 feet.',tags:['defense','damage','retaliation']},{id:'freedom-of-movement',name:'Freedom of Movement',school:'Abjuration',classes:['bard','cleric','druid','ranger'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Touch a willing creature. Its movement is unaffected by difficult terrain. Spells and magical effects can\'t reduce speed or cause paralysis/restraint. Can spend 5 feet of movement to escape nonmagical restraints. No penalty for moving underwater.',tags:['buff','mobility']},{id:'giant-insect',name:'Giant Insect',school:'Transmutation',classes:['druid'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Transform up to 10 centipedes, 3 spiders, 5 wasps, or 1 scorpion into giant versions. They obey your verbal commands. In combat, they act on your turn.',tags:['summoning','transformation']},{id:'greater-invisibility',name:'Greater Invisibility',school:'Illusion',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'Concentration, 1 minute',description:'You or a creature you touch becomes invisible until the spell ends. Anything the target is wearing or carrying is invisible. The target can attack and cast spells without ending the invisibility.',tags:['stealth','utility']},{id:'guardian-of-faith',name:'Guardian of Faith',school:'Conjuration',classes:['cleric'],castingTime:'1 action',range:'30 feet',components:'V',duration:'8 hours',description:'Create a Large spectral guardian. Hostile creature moving within 10 feet of guardian for first time must make Dex save, taking 20 radiant damage on fail (half on success). Guardian vanishes when it has dealt 60 total damage.',tags:['damage','radiant','protection']},{id:'hallucinatory-terrain',name:'Hallucinatory Terrain',school:'Illusion',classes:['bard','druid','warlock','wizard'],castingTime:'10 minutes',range:'300 feet',components:'V, S, M',duration:'24 hours',description:'Make natural terrain in 150-foot cube look, sound, and smell like some other natural terrain. Structures, equipment, and creatures not concealed. Investigation check to see through illusion.',tags:['illusion','terrain']},{id:'ice-storm',name:'Ice Storm',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'300 feet',components:'V, S, M',duration:'Instantaneous',description:'Hail stones pound down in 20-foot radius, 40-foot high cylinder. Creatures make Dex save, taking 2d8 bludgeoning + 4d6 cold on fail (half on success). Area becomes difficult terrain until end of your next turn. Upcast: bludgeoning increases 1d8 per slot level above 4th.',tags:['damage','cold','control','aoe']},{id:'locate-creature',name:'Locate Creature',school:'Divination',classes:['bard','cleric','druid','paladin','ranger','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 hour',description:'Sense direction to a specific creature you\'re familiar with or nearest of a specific type, if within 1,000 feet. Can\'t locate if running water separates you or if target is polymorphed.',tags:['detection','utility']},{id:'mordenkainens-faithful-hound',name:"Mordenkainen's Faithful Hound",school:'Conjuration',classes:['wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'8 hours',description:'Conjure a phantom watchdog. It is invisible to all but you, can\'t be harmed, and barks when any creature comes within 30 feet. At the start of your turns, the hound can bite one creature within 5 feet (melee attack, 4d8 piercing).',tags:['protection','summoning']},{id:'mordenkainens-private-sanctum',name:"Mordenkainen's Private Sanctum",school:'Abjuration',classes:['wizard'],castingTime:'10 minutes',range:'120 feet',components:'V, S, M',duration:'24 hours',description:'Make area within 100-foot cube magically secure. Choose: sound can\'t pass through, area is dark and filled with fog, divination spells can\'t target creatures/areas inside, nothing can teleport in, planar travel blocked. Upcast: +100-foot cube per slot level above 4th.',tags:['protection','utility']},{id:'otilukes-resilient-sphere',name:"Otiluke's Resilient Sphere",school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create shimmering sphere around Large or smaller creature/object. Dex save negates (willing creatures can fail intentionally). Creature inside can breathe. Nothing can pass through physically or magically. Sphere weighs nothing and can be pushed.',tags:['protection','control']},{id:'phantasmal-killer',name:'Phantasmal Killer',school:'Illusion',classes:['wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Create an illusory manifestation of a creature\'s deepest fears. Target must make Wis save or become frightened. At end of each turn, target makes another Wis save. On fail: 4d10 psychic damage. On success: spell ends. Upcast: +1d10 per slot level above 4th.',tags:['damage','psychic','fear','illusion']},{id:'polymorph',name:'Polymorph',school:'Transmutation',classes:['bard','druid','sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Transform a creature into a new beast form. Wis save (unwilling). New form\'s CR must be equal to or less than target\'s level (or CR). Game statistics replaced by new form\'s. Limited actions by new form\'s capabilities. Reverts when reduced to 0 HP.',tags:['transformation','utility']},{id:'staggering-smite',name:'Staggering Smite',school:'Evocation',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next weapon hit deals extra 4d6 psychic damage and target must make Wis save or have disadvantage on attacks and ability checks, and can\'t take reactions, until end of its next turn.',tags:['damage','psychic','debuff']},{id:'stoneskin',name:'Stoneskin',school:'Abjuration',classes:['druid','ranger','sorcerer','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 hour',description:'Touch a willing creature. Until the spell ends, the target has resistance to nonmagical bludgeoning, piercing, and slashing damage.',tags:['defense','buff']},{id:'wall-of-fire',name:'Wall of Fire',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create wall of fire up to 60 feet long, 20 feet high, 1 foot thick (or ringed, 20-foot diameter, 20 feet high). One side (your choice) deals 5d8 fire damage to creatures within 10 feet (Dex half). Creature entering wall or ending turn there takes 5d8 (Dex half). Upcast: +1d8 per slot level above 4th.',tags:['damage','fire','control']},],5:[{id:'animate-objects',name:'Animate Objects',school:'Transmutation',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Animate up to 10 nonmagical objects. Objects follow your verbal commands and act on your turn. Statistics based on size (Tiny: AC 18, HP 20, +8 attack, 1d4+4 damage). Upcast: +2 objects per slot level above 5th.',tags:['summoning','utility']},{id:'antilife-shell',name:'Antilife Shell',school:'Abjuration',classes:['druid'],castingTime:'1 action',range:'Self (10-foot radius)',components:'V, S',duration:'Concentration, 1 hour',description:'Create shimmering barrier around you. Creatures other than undead and constructs can\'t pass through or reach through to touch you or attack you with melee attacks.',tags:['protection','defense']},{id:'awaken',name:'Awaken',school:'Transmutation',classes:['bard','druid'],castingTime:'8 hours',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Touch a Huge or smaller beast or plant. Target gains Int 10 and ability to speak one language you know. If beast, it is charmed by you for 30 days (or until you or allies harm it).',tags:['utility','nature']},{id:'banishing-smite',name:'Banishing Smite',school:'Abjuration',classes:['paladin'],castingTime:'1 bonus action',range:'Self',components:'V',duration:'Concentration, 1 minute',description:'Next weapon hit deals extra 5d10 force damage. If this brings target to 50 HP or fewer, it must make Cha save or be banished. If native to different plane, it returns there. Otherwise, sent to harmless demiplane until spell ends.',tags:['damage','force','banishment']},{id:'bigbys-hand',name:"Bigby's Hand",school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create Large hand of shimmering force. AC 20, HP equal to your HP max, Str 26. Can use bonus action for: Clenched Fist (melee attack, 4d8 force), Forceful Hand (push), Grasping Hand (grapple), or Interposing Hand (half cover). Upcast: +2d8 fist, +2d6 grasping per slot level above 5th.',tags:['damage','control','force']},{id:'circle-of-power',name:'Circle of Power',school:'Abjuration',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Concentration, 10 minutes',description:'Divine energy radiates from you. Friendly creatures in aura have advantage on saving throws against magical effects. If a save would normally halve damage, they take no damage on success.',tags:['protection','buff','aoe']},{id:'cloudkill',name:'Cloudkill',school:'Conjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Create 20-foot-radius sphere of poisonous, yellowish-green fog. Heavily obscures. Creature entering or starting turn in fog must make Con save, taking 5d8 poison damage on fail (half on success). Fog moves 10 feet away from you at start of your turn. Upcast: +1d8 per slot level above 5th.',tags:['damage','poison','control']},{id:'commune',name:'Commune',school:'Divination',classes:['cleric'],castingTime:'1 minute',range:'Self',components:'V, S, M',duration:'1 minute',description:'Contact your deity or proxy. Ask up to 3 yes-or-no questions. Divine beings aren\'t omniscient. If question doesn\'t apply, answer is "unclear."',tags:['utility','knowledge','ritual']},{id:'commune-with-nature',name:'Commune with Nature',school:'Divination',classes:['druid','ranger'],castingTime:'1 minute',range:'Self',components:'V, S',duration:'Instantaneous',description:'Become one with nature. Learn up to 3 facts about terrain within 3 miles (or 300 feet underground): terrain, bodies of water, prevalent plants/minerals/animals/peoples, powerful celestials/fey/fiends/elementals/undead.',tags:['utility','detection','ritual']},{id:'cone-of-cold',name:'Cone of Cold',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self (60-foot cone)',components:'V, S, M',duration:'Instantaneous',description:'Blast of cold air erupts from your hands. Each creature in 60-foot cone makes Con save, taking 8d8 cold damage on fail (half on success). Creature killed by this spell becomes frozen statue. Upcast: +1d8 per slot level above 5th.',tags:['damage','cold','aoe']},{id:'conjure-elemental',name:'Conjure Elemental',school:'Conjuration',classes:['druid','wizard'],castingTime:'1 minute',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Summon elemental of CR 5 or lower. It obeys your verbal commands. If concentration breaks, elemental becomes hostile. Upcast: +1 CR per slot level above 5th.',tags:['summoning']},{id:'contagion',name:'Contagion',school:'Necromancy',classes:['cleric','druid'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'7 days',description:'Touch a creature and afflict it with a disease. Target must make 3 Con saves (end of each turn). 3 failures: disease takes effect (Blinding Sickness, Filth Fever, Flesh Rot, Mindfire, Seizure, or Slimy Doom). 3 successes: disease ends.',tags:['debuff','disease']},{id:'contact-other-plane',name:'Contact Other Plane',school:'Divination',classes:['warlock','wizard'],castingTime:'1 minute',range:'Self',components:'V',duration:'1 minute',description:'Contact a demigod, spirit, or alien entity. DC 15 Int save or take 6d6 psychic damage and be insane until long rest. On success, ask up to 5 questions and receive one-word answers.',tags:['utility','knowledge','ritual']},{id:'creation',name:'Creation',school:'Illusion',classes:['sorcerer','wizard'],castingTime:'1 minute',range:'30 feet',components:'V, S, M',duration:'Special',description:'Pull wisps of shadow to create nonliving object of vegetable matter (24 hours), stone/crystal (12 hours), precious metals (1 hour), gems (10 minutes), adamantine/mithral (1 minute). Size up to 5-foot cube. Upcast: +5-foot cube per slot level above 5th.',tags:['utility']},{id:'destructive-wave',name:'Destructive Wave',school:'Evocation',classes:['paladin'],castingTime:'1 action',range:'Self (30-foot radius)',components:'V',duration:'Instantaneous',description:'Strike ground and divine energy ripples out. Creatures you choose within 30 feet must make Con save, taking 5d6 thunder + 5d6 radiant/necrotic damage on fail (half on success), and be knocked prone on fail.',tags:['damage','thunder','radiant','aoe']},{id:'dispel-evil-and-good',name:'Dispel Evil and Good',school:'Abjuration',classes:['cleric','paladin'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 minute',description:'Shimmering energy surrounds you. Aberrations, celestials, elementals, fey, fiends, undead have disadvantage on attacks against you. Can use action to: Break Enchantment (end charm/frighten/possession on one creature) or Dismissal (melee spell attack to send creature to home plane, Cha save negates).',tags:['protection','banishment']},{id:'dominate-person',name:'Dominate Person',school:'Enchantment',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Charm a humanoid. Wis save (advantage if fighting you). Telepathic link, can command as action. Can use reaction for precise control. New save when takes damage. Upcast: duration increases (10 min at 6th, 1 hour at 7th, 8 hours at 8th, 24 hours at 9th).',tags:['charm','control']},{id:'dream',name:'Dream',school:'Illusion',classes:['bard','warlock','wizard'],castingTime:'1 minute',range:'Special',components:'V, S, M',duration:'8 hours',description:'Shape a creature\'s dreams. Target must be known to you and on same plane. Messenger enters target\'s dreams and can converse for duration. Can make messenger terrifying (Wis save or 3d6 psychic damage and no benefit from rest).',tags:['communication','illusion','psychic']},{id:'flame-strike',name:'Flame Strike',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Instantaneous',description:'Vertical column of divine fire roars down in 10-foot-radius, 40-foot-high cylinder. Creatures make Dex save, taking 4d6 fire + 4d6 radiant on fail (half on success). Upcast: +1d6 fire or radiant (your choice) per slot level above 5th.',tags:['damage','fire','radiant','aoe']},{id:'geas',name:'Geas',school:'Enchantment',classes:['bard','cleric','druid','paladin','wizard'],castingTime:'1 minute',range:'60 feet',components:'V',duration:'30 days',description:'Place magical command on a creature. Wis save negates. If creature acts against command, takes 5d10 psychic damage (once per day). Upcast: 1 year at 7th, permanent at 9th.',tags:['charm','control']},{id:'greater-restoration',name:'Greater Restoration',school:'Abjuration',classes:['bard','cleric','druid'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Imbue creature with positive energy. End one: reduce exhaustion by one level, charmed or petrified condition, one curse (including attunement to cursed item), any reduction to ability score, or any effect reducing HP maximum.',tags:['healing','restoration']},{id:'hallow',name:'Hallow',school:'Evocation',classes:['cleric'],castingTime:'24 hours',range:'Touch',components:'V, S, M',duration:'Until dispelled',description:'Touch a point to create 60-foot radius hallowed area. Celestials, elementals, fey, fiends, undead can\'t enter. Add one extra effect: Courage, Darkness, Daylight, Energy Protection, Everlasting Rest, Extradimensional Interference, Fear, Silence, or Tongues.',tags:['protection','ritual']},{id:'hold-monster',name:'Hold Monster',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'90 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Choose creature you can see. Wis save or be paralyzed. Target repeats save at end of each turn. Upcast: +1 target per slot level above 5th.',tags:['control','debuff']},{id:'insect-plague',name:'Insect Plague',school:'Conjuration',classes:['cleric','druid','sorcerer'],castingTime:'1 action',range:'300 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Swarming, biting locusts fill 20-foot radius sphere. Area is lightly obscured and difficult terrain. Creature entering or starting turn there makes Con save, taking 4d10 piercing on fail (half on success). Upcast: +1d10 per slot level above 5th.',tags:['damage','control','aoe']},{id:'legend-lore',name:'Legend Lore',school:'Divination',classes:['bard','cleric','wizard'],castingTime:'10 minutes',range:'Self',components:'V, S, M',duration:'Instantaneous',description:'Learn legendary information about a person, place, or object. If thing is of legendary importance, you learn lore. Information might include current tales, forgotten stories, or secret lore.',tags:['utility','knowledge']},{id:'mass-cure-wounds',name:'Mass Cure Wounds',school:'Evocation',classes:['bard','cleric','druid'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Up to 6 creatures in 30-foot radius regain 3d8 + spellcasting modifier HP. No effect on undead or constructs. Upcast: +1d8 per slot level above 5th.',tags:['healing','aoe']},{id:'mislead',name:'Mislead',school:'Illusion',classes:['bard','wizard'],castingTime:'1 action',range:'Self',components:'S',duration:'Concentration, 1 hour',description:'Become invisible and create illusory double at your location. You can see and hear through the double. Use action to move it up to twice your speed and speak through it.',tags:['illusion','stealth']},{id:'modify-memory',name:'Modify Memory',school:'Enchantment',classes:['bard','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Charm a creature (Wis save negates). While charmed, reshape its memories of an event within the last 24 hours (no longer than 10 minutes). Modified memory must make sense. Upcast: extends time (7 days at 6th, 30 days at 7th, 1 year at 8th, any time at 9th).',tags:['charm','control']},{id:'passwall',name:'Passwall',school:'Transmutation',classes:['wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'1 hour',description:'Create a passage through wood, plaster, or stone. The opening can be up to 5 feet wide, 8 feet tall, and 20 feet deep.',tags:['utility']},{id:'planar-binding',name:'Planar Binding',school:'Abjuration',classes:['bard','cleric','druid','wizard'],castingTime:'1 hour',range:'60 feet',components:'V, S, M',duration:'24 hours',description:'Bind a celestial, elemental, fey, or fiend. Target must be within range and stay there entire casting. Target makes Cha save; on fail, must serve you (if you speak its language). Upcast: duration increases (10 days at 6th, 30 days at 7th, 180 days at 8th, 1 year and 1 day at 9th).',tags:['summoning','control']},{id:'raise-dead',name:'Raise Dead',school:'Necromancy',classes:['bard','cleric','paladin'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Return dead creature to life (died within 10 days, not undead). Target returns with 1 HP. Cures poison/nonmagical diseases, but not magical diseases, curses, or similar. -4 penalty to attacks, saves, ability checks (reduces by 1 per long rest). Can\'t restore missing body parts.',tags:['healing','resurrection']},{id:'reincarnate',name:'Reincarnate',school:'Transmutation',classes:['druid'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Touch a dead humanoid (died within 10 days). Soul returns in a new body (roll d100 for race). New body has no memory of past life. Can speak with deceased soul to learn identity.',tags:['healing','resurrection']},{id:'scrying',name:'Scrying',school:'Divination',classes:['bard','cleric','druid','warlock','wizard'],castingTime:'10 minutes',range:'Self',components:'V, S, M',duration:'Concentration, 10 minutes',description:'See and hear a creature on the same plane. Wis save (modified by your knowledge of target and physical connection). On fail, you can see 10-foot radius around target.',tags:['detection','utility']},{id:'seeming',name:'Seeming',school:'Illusion',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S',duration:'8 hours',description:'Change the appearance of any number of creatures you can see within range. Unwilling creatures can make Cha save. Can change height up to 1 foot, change body type, disguise clothing/weapons/equipment.',tags:['illusion','utility']},{id:'swift-quiver',name:'Swift Quiver',school:'Transmutation',classes:['ranger'],castingTime:'1 bonus action',range:'Touch',components:'V, S, M',duration:'Concentration, 1 minute',description:'Transmute your quiver so it produces an endless supply of ammunition. On each turn, you can use a bonus action to make two attacks with a weapon that uses ammunition from the quiver.',tags:['buff','combat']},{id:'telekinesis',name:'Telekinesis',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Gain ability to move or manipulate creatures or objects with your mind. Each turn, use action to: move object up to 1,000 pounds 30 feet, or exert fine control on object, or try to move a creature (opposed check, your spellcasting vs their Str).',tags:['control','utility']},{id:'teleportation-circle',name:'Teleportation Circle',school:'Conjuration',classes:['bard','sorcerer','wizard'],castingTime:'1 minute',range:'10 feet',components:'V, M',duration:'Round',description:'Draw a circle that links to another permanent teleportation circle. Any creature entering your circle is instantly transported to the destination. Casting daily for 1 year makes it permanent.',tags:['teleportation','utility']},{id:'tree-stride',name:'Tree Stride',school:'Conjuration',classes:['druid','ranger'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 1 minute',description:'Gain ability to enter a tree and move from inside it to inside another tree of the same kind within 500 feet. Uses 5 feet of movement. Must be able to see or know location of destination tree.',tags:['mobility','teleportation','nature']},{id:'wall-of-force',name:'Wall of Force',school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create an invisible wall of force. Can be a dome/sphere up to 10-foot radius or up to ten 10-foot panels. Nothing can physically pass through. Immune to all damage. Dispel magic can dispel it.',tags:['protection','control']},{id:'wall-of-stone',name:'Wall of Stone',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create a wall of nonmagical stone. Up to ten 10×10×6-inch panels. Each panel must be contiguous. If wall cuts through creature\'s space, creature is pushed to safe side (Dex save to choose). Wall can be destroyed (AC 15, 30 HP per panel).',tags:['control','terrain']},],6:[{id:'blade-barrier',name:'Blade Barrier',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'90 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Create vertical wall of blades up to 100 feet long, 20 feet high, 5 feet thick. Provides three-quarters cover. Creature passing through takes 6d10 slashing (Dex half).',tags:['damage','control']},{id:'chain-lightning',name:'Chain Lightning',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Instantaneous',description:'Lightning arcs from you to target, then jumps to up to 3 additional targets within 30 feet. Each target makes Dex save, taking 10d8 lightning on fail (half on success). Upcast: +1 target per slot level above 6th.',tags:['damage','lightning']},{id:'circle-of-death',name:'Circle of Death',school:'Necromancy',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Instantaneous',description:'Sphere of negative energy ripples out in 60-foot radius. Creatures make Con save, taking 8d6 necrotic on fail (half on success). Upcast: +2d6 per slot level above 6th.',tags:['damage','necrotic','aoe']},{id:'disintegrate',name:'Disintegrate',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Instantaneous',description:'Thin green ray springs from your finger. Target makes Dex save; 10d6+40 force damage on fail, nothing on success. If damage reduces target to 0 HP, it is disintegrated. Disintegrates up to 10-foot cube of nonmagical object. Upcast: +3d6 per slot level above 6th.',tags:['damage','force']},{id:'eyebite',name:'Eyebite',school:'Necromancy',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'Concentration, 1 minute',description:'Your eyes become void. Use action each turn to target creature within 60 feet that can see you. Choose: Asleep (Wis save or fall unconscious), Panicked (Wis save or frightened), Sickened (Con save or disadvantage on attacks/checks).',tags:['debuff','control']},{id:'find-the-path',name:'Find the Path',school:'Divination',classes:['bard','cleric','druid'],castingTime:'1 minute',range:'Self',components:'V, S, M',duration:'Concentration, 1 day',description:'Name a specific location. While spell lasts, you know the shortest, most direct route to that location (not necessarily safest).',tags:['utility','navigation']},{id:'globe-of-invulnerability',name:'Globe of Invulnerability',school:'Abjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self (10-foot radius)',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create immobile, faintly shimmering barrier. Any spell of 5th level or lower cast from outside can\'t affect creatures or objects within. Upcast: blocks one level higher per slot level above 6th.',tags:['protection','defense']},{id:'harm',name:'Harm',school:'Necromancy',classes:['cleric'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Unleash a virulent disease. Target makes Con save, taking 14d6 necrotic on fail (half on success). HP maximum is reduced by damage taken (restored by greater restoration or similar). Can\'t reduce HP below 1.',tags:['damage','necrotic']},{id:'heal',name:'Heal',school:'Evocation',classes:['cleric','druid'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Creature regains 70 HP and is cured of blindness, deafness, and any diseases. No effect on undead or constructs. Upcast: +10 HP per slot level above 6th.',tags:['healing']},{id:'heroes-feast',name:"Heroes' Feast",school:'Conjuration',classes:['cleric','druid'],castingTime:'10 minutes',range:'30 feet',components:'V, S, M',duration:'Instantaneous',description:'Create a magnificent feast for up to 12 creatures. Takes 1 hour to consume. Cures diseases/poison, grants immunity to poison/frightened, advantage on Wis saves, and 2d10 additional HP max (24 hours).',tags:['buff','healing']},{id:'mass-suggestion',name:'Mass Suggestion',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, M',duration:'24 hours',description:'Suggest a course of activity to up to 12 creatures you can see that can hear and understand you. Wis save negates. Upcast: duration increases (10 days at 7th, 30 days at 8th, 1 year and 1 day at 9th).',tags:['charm','control']},{id:'move-earth',name:'Move Earth',school:'Transmutation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 2 hours',description:'Reshape terrain in 40-foot square up to 10 feet deep. Move earth slowly (change happens over 10 minutes). Not violent enough to cause damage.',tags:['utility','terrain']},{id:'ottos-irresistible-dance',name:"Otto's Irresistible Dance",school:'Enchantment',classes:['bard','wizard'],castingTime:'1 action',range:'30 feet',components:'V',duration:'Concentration, 1 minute',description:'Target begins dancing. While dancing: must use all movement dancing in place, disadvantage on Dex saves, disadvantage on attacks against it. Target can use action to make Wis save to end effect.',tags:['control','debuff']},{id:'planar-ally',name:'Planar Ally',school:'Conjuration',classes:['cleric'],castingTime:'10 minutes',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Beseech an otherworldly entity for aid. Entity sends a celestial, elemental, or fiend. Creature is not under your control; you must bargain for its services.',tags:['summoning']},{id:'sunbeam',name:'Sunbeam',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'Self (60-foot line)',components:'V, S, M',duration:'Concentration, 1 minute',description:'Beam of brilliant light flashes in 60-foot line, 5 feet wide. Creatures make Con save, taking 6d8 radiant on fail (half on success) and are blinded until your next turn. Undead and oozes have disadvantage. Can create new line each turn as action.',tags:['damage','radiant','aoe']},{id:'transport-via-plants',name:'Transport via Plants',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'10 feet',components:'V, S',duration:'1 round',description:'Create magical link between Large or larger plant and another plant on same plane. Any creature can step through and exit from destination plant.',tags:['teleportation','nature']},{id:'true-seeing',name:'True Seeing',school:'Divination',classes:['bard','cleric','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Target gains truesight out to 120 feet: see in normal and magical darkness, see invisible creatures and objects, automatically detect visual illusions, see original form of shapechanger/transformed creature, see into Ethereal Plane.',tags:['detection','buff']},{id:'wall-of-ice',name:'Wall of Ice',school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create ice wall. Up to ten 10-foot panels. Creature in wall\'s space makes Dex save, taking 10d6 cold on fail (half on success). Wall has AC 12, 30 HP per 10-foot section. When section is destroyed, area is difficult terrain and deals 5d6 cold (Dex half).',tags:['damage','cold','control']},{id:'wall-of-thorns',name:'Wall of Thorns',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'120 feet',components:'V, S, M',duration:'Concentration, 10 minutes',description:'Create wall of tough, pliable thorns up to 60 feet long, 10 feet high, 5 feet thick. Creature entering or passing through makes Dex save, taking 7d8 slashing on fail (half on success). Upcast: +1d8 per slot level above 6th.',tags:['damage','control']},{id:'word-of-recall',name:'Word of Recall',school:'Conjuration',classes:['cleric'],castingTime:'1 action',range:'5 feet',components:'V',duration:'Instantaneous',description:'You and up to 5 willing creatures within 5 feet are instantly transported to a previously designated sanctuary associated with your deity.',tags:['teleportation','utility']},],7:[{id:'conjure-celestial',name:'Conjure Celestial',school:'Conjuration',classes:['cleric'],castingTime:'1 minute',range:'90 feet',components:'V, S',duration:'Concentration, 1 hour',description:'Summon a celestial of CR 4 or lower. It is friendly and obeys your verbal commands. Upcast: CR 5 at 9th level.',tags:['summoning']},{id:'divine-word',name:'Divine Word',school:'Evocation',classes:['cleric'],castingTime:'1 bonus action',range:'30 feet',components:'V',duration:'Instantaneous',description:'Utter a divine word. Creatures within range make Cha save. Effects based on current HP: 50+ deafened 1 min, 40- blinded 10 min, 30- stunned 1 hour, 20- killed. Celestials/elementals/fey/fiends failing save are forced back to home plane.',tags:['damage','banishment']},{id:'etherealness',name:'Etherealness',school:'Transmutation',classes:['bard','cleric','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Self',components:'V, S',duration:'8 hours',description:'Step into Ethereal Plane. You can see and hear the plane you originated from (grayed out, 60-foot sight). Moving uses your normal speed. You can affect and be affected only by other creatures on Ethereal Plane. Upcast: +3 targets per slot level above 7th.',tags:['utility','planar']},{id:'finger-of-death',name:'Finger of Death',school:'Necromancy',classes:['sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Send negative energy coursing through a creature. Con save; 7d8+30 necrotic on fail (half on success). Humanoid killed by this spell rises as a zombie at the start of your next turn, permanently under your command.',tags:['damage','necrotic','necromancy']},{id:'fire-storm',name:'Fire Storm',school:'Evocation',classes:['cleric','druid','sorcerer'],castingTime:'1 action',range:'150 feet',components:'V, S',duration:'Instantaneous',description:'Storm of roaring flame appears in up to ten 10-foot cubes (arrange as you wish). Creatures make Dex save, taking 7d10 fire on fail (half on success). Can designate creatures and objects as unaffected.',tags:['damage','fire','aoe']},{id:'forcecage',name:'Forcecage',school:'Evocation',classes:['bard','warlock','wizard'],castingTime:'1 action',range:'100 feet',components:'V, S, M',duration:'1 hour',description:'Create an immobile, invisible, cube-shaped prison of force. Choose: cage (barred, 10-foot cube, bars 1/2 inch apart) or box (solid walls, up to 10-foot cube). Nothing can pass through walls or teleport in/out without Cha save.',tags:['control','prison']},{id:'mirage-arcane',name:'Mirage Arcane',school:'Illusion',classes:['bard','druid','wizard'],castingTime:'10 minutes',range:'Sight',components:'V, S',duration:'10 days',description:'Make terrain in 1-mile square look, sound, smell, and feel like other terrain. Tactile components are real enough to support weight.',tags:['illusion','terrain']},{id:'plane-shift',name:'Plane Shift',school:'Conjuration',classes:['cleric','druid','sorcerer','warlock','wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Transport yourself and up to 8 willing creatures to a different plane. Can also banish an unwilling creature (melee spell attack, Cha save negates).',tags:['teleportation','planar','banishment']},{id:'regenerate',name:'Regenerate',school:'Transmutation',classes:['bard','cleric','druid'],castingTime:'1 minute',range:'Touch',components:'V, S, M',duration:'1 hour',description:'Touch a creature. It regains 4d8+15 HP and regains 1 HP at the start of each of its turns for the duration. Severed body parts regrow after 2 minutes.',tags:['healing']},{id:'resurrection',name:'Resurrection',school:'Necromancy',classes:['bard','cleric'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Return a creature dead up to 100 years to life. Neutralizes poisons, cures normal diseases, but not magical diseases/curses. Restores all HP. Can restore missing body parts. Takes -4 penalty to all d20 rolls (reduces by 1 per long rest).',tags:['healing','resurrection']},{id:'reverse-gravity',name:'Reverse Gravity',school:'Transmutation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'100 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Reverse gravity in 50-foot-radius, 100-foot-high cylinder. Creatures and objects fall upward. Creature can make Dex save to grab fixed object. If they reach top and hit solid surface, they take falling damage. Objects and creatures fall back down when spell ends.',tags:['control','utility']},{id:'sequester',name:'Sequester',school:'Transmutation',classes:['wizard'],castingTime:'1 action',range:'Touch',components:'V, S, M',duration:'Until dispelled',description:'Render a willing creature or object invisible and hidden from divination. Time stops for the target. Can set condition to end the spell.',tags:['utility','protection']},{id:'simulacrum',name:'Simulacrum',school:'Illusion',classes:['wizard'],castingTime:'12 hours',range:'Touch',components:'V, S, M',duration:'Until dispelled',description:'Create an illusory duplicate of a beast or humanoid. The simulacrum has half the creature\'s HP max, no equipment, and can\'t regain spell slots. It obeys your commands.',tags:['summoning','illusion']},{id:'symbol',name:'Symbol',school:'Abjuration',classes:['bard','cleric','wizard'],castingTime:'1 minute',range:'Touch',components:'V, S, M',duration:'Until dispelled or triggered',description:'Inscribe a harmful glyph. When triggered, affects creatures within 60 feet. Effects: Death, Discord, Fear, Hopelessness, Insanity, Pain, Sleep, or Stunning.',tags:['trap','control']},{id:'teleport',name:'Teleport',school:'Conjuration',classes:['bard','sorcerer','wizard'],castingTime:'1 action',range:'10 feet',components:'V',duration:'Instantaneous',description:'Instantly transport yourself and up to 8 willing creatures to a destination you choose. Accuracy depends on familiarity with destination.',tags:['teleportation']},],8:[{id:'antimagic-field',name:'Antimagic Field',school:'Abjuration',classes:['cleric','wizard'],castingTime:'1 action',range:'Self (10-foot-radius sphere)',components:'V, S, M',duration:'Concentration, 1 hour',description:'Create 10-foot-radius sphere of antimagic. Spells can\'t be cast, magical effects are suppressed, magic items become mundane.',tags:['protection','control']},{id:'clone',name:'Clone',school:'Necromancy',classes:['wizard'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Grow an inert duplicate of a living creature. If original creature dies, its soul transfers to clone (if free and willing). Clone is identical to original at time of casting.',tags:['utility','resurrection']},{id:'control-weather',name:'Control Weather',school:'Transmutation',classes:['cleric','druid','wizard'],castingTime:'10 minutes',range:'Self (5-mile radius)',components:'V, S, M',duration:'Concentration, 8 hours',description:'Take control of the weather within 5 miles. You can change precipitation, temperature, and wind. Changes take 1d4 × 10 minutes to take effect.',tags:['utility','control']},{id:'demiplane',name:'Demiplane',school:'Conjuration',classes:['warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'S',duration:'1 hour',description:'Create a door to a demiplane that appears as a 30-foot cube. Can create new or access existing demiplanes you\'ve created.',tags:['utility','planar']},{id:'dominate-monster',name:'Dominate Monster',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 1 hour',description:'Charm a creature you can see. Wis save (advantage if fighting you). Telepathic link, command as action or reaction. New save when takes damage. Upcast: 8 hours at 9th level.',tags:['charm','control']},{id:'earthquake',name:'Earthquake',school:'Evocation',classes:['cleric','druid','sorcerer'],castingTime:'1 action',range:'500 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Create a seismic disturbance in 100-foot-radius circle. Creatures must make Dex save each turn or fall prone. Difficult terrain. Can cause fissures, damage structures.',tags:['control','damage','terrain']},{id:'feeblemind',name:'Feeblemind',school:'Enchantment',classes:['bard','druid','warlock','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Instantaneous',description:'Blast a creature\'s mind. Int save; 4d6 psychic damage on fail and Int and Cha become 1. Can\'t cast spells, activate items, understand language, or communicate. Creature can repeat save every 30 days.',tags:['damage','psychic','debuff']},{id:'glibness',name:'Glibness',school:'Transmutation',classes:['bard','warlock'],castingTime:'1 action',range:'Self',components:'V',duration:'1 hour',description:'Whenever you make a Charisma check, you can replace the number you roll with a 15. Magic that would determine if you\'re lying indicates you\'re being truthful.',tags:['buff','social']},{id:'holy-aura',name:'Holy Aura',school:'Abjuration',classes:['cleric'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 minute',description:'Divine light shines in 30-foot radius. Creatures you choose have advantage on all saving throws, and other creatures have disadvantage on attacks against them. Fiend or undead hitting with melee must make Con save or be blinded until end of spell.',tags:['buff','protection','aoe']},{id:'incendiary-cloud',name:'Incendiary Cloud',school:'Conjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Swirling cloud of smoke and embers in 20-foot-radius sphere. Heavily obscures. Creatures entering or starting turn in cloud make Dex save, taking 10d8 fire on fail (half on success). Cloud moves 10 feet away from you at start of your turn.',tags:['damage','fire','control']},{id:'maze',name:'Maze',school:'Conjuration',classes:['wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Concentration, 10 minutes',description:'Banish a creature into a labyrinthine demiplane. Creature can use action to make DC 20 Int check to escape. When spell ends, target reappears in nearest unoccupied space.',tags:['control','banishment']},{id:'mind-blank',name:'Mind Blank',school:'Abjuration',classes:['bard','wizard'],castingTime:'1 action',range:'Touch',components:'V, S',duration:'24 hours',description:'Until spell ends, one willing creature is immune to psychic damage, any effect that would sense emotions/read thoughts, divination spells, and the charmed condition.',tags:['protection','buff']},{id:'power-word-stun',name:'Power Word Stun',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Speak a word of power that can overwhelm the mind of one creature. If target has 150 HP or fewer, it is stunned. Otherwise, spell has no effect. Target repeats Con save at end of each turn to end effect.',tags:['control','debuff']},{id:'sunburst',name:'Sunburst',school:'Evocation',classes:['druid','sorcerer','wizard'],castingTime:'1 action',range:'150 feet',components:'V, S, M',duration:'Instantaneous',description:'Brilliant sunlight flashes in 60-foot radius. Creatures make Con save, taking 12d6 radiant on fail (half on success) and are blinded for 1 minute (repeat save each turn). Dispels magical darkness.',tags:['damage','radiant','aoe']},{id:'telepathy',name:'Telepathy',school:'Evocation',classes:['wizard'],castingTime:'1 action',range:'Unlimited',components:'V, S, M',duration:'24 hours',description:'Create a telepathic link with one willing creature you\'re familiar with. Until spell ends, you and target can instantaneously share words, images, sounds, and other sensory messages. Works across any distance and planes.',tags:['communication','utility']},{id:'tsunami',name:'Tsunami',school:'Conjuration',classes:['druid'],castingTime:'1 minute',range:'Sight',components:'V, S',duration:'Concentration, 6 rounds',description:'Create a wall of water up to 300 feet long, 300 feet high, 50 feet thick. Creatures make Str save, taking 6d10 bludgeoning on fail (half on success). Wave moves 50 feet away each round. Damage decreases 1d10 each round.',tags:['damage','control']},],9:[{id:'astral-projection',name:'Astral Projection',school:'Necromancy',classes:['cleric','warlock','wizard'],castingTime:'1 hour',range:'10 feet',components:'V, S, M',duration:'Special',description:'Project yourself and up to 8 willing creatures into the Astral Plane. Your body remains behind in suspended animation. You can travel through the Astral Plane and to other planes.',tags:['utility','planar']},{id:'foresight',name:'Foresight',school:'Divination',classes:['bard','druid','warlock','wizard'],castingTime:'1 minute',range:'Touch',components:'V, S, M',duration:'8 hours',description:'Touch a willing creature. For the duration, target can\'t be surprised, has advantage on attack rolls, ability checks, and saving throws, and other creatures have disadvantage on attacks against it.',tags:['buff','protection']},{id:'gate',name:'Gate',school:'Conjuration',classes:['cleric','sorcerer','wizard'],castingTime:'1 action',range:'60 feet',components:'V, S, M',duration:'Concentration, 1 minute',description:'Conjure a portal to a specific location on a different plane. You can also speak the true name of a specific creature (not a deity) to pull them through (Cha save for unwilling).',tags:['teleportation','planar','summoning']},{id:'imprisonment',name:'Imprisonment',school:'Abjuration',classes:['warlock','wizard'],castingTime:'1 minute',range:'30 feet',components:'V, S, M',duration:'Until dispelled',description:'Create a magical restraint. Wis save negates. Options include: Burial (entombed in stone), Chaining (bound by chains), Hedged Prison (confined to small area), Minimus Containment (shrunk into gem), Slumber (put to sleep).',tags:['control','prison']},{id:'mass-heal',name:'Mass Heal',school:'Evocation',classes:['cleric'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'Flood of healing energy flows from you into creatures in 60 feet. Restore up to 700 HP divided among any creatures you choose. Cures all diseases and ends blindness/deafness.',tags:['healing','aoe']},{id:'meteor-swarm',name:'Meteor Swarm',school:'Evocation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'1 mile',components:'V, S',duration:'Instantaneous',description:'Four blazing orbs crash down at points you choose within range. Each creature in 40-foot radius sphere at each point makes Dex save, taking 20d6 fire + 20d6 bludgeoning on fail (half on success). Area becomes difficult terrain.',tags:['damage','fire','aoe']},{id:'power-word-heal',name:'Power Word Heal',school:'Evocation',classes:['bard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'Instantaneous',description:'A wave of healing energy washes over one creature. Target regains all its HP. Also ends charmed, frightened, paralyzed, stunned. Target can use reaction to stand up.',tags:['healing']},{id:'power-word-kill',name:'Power Word Kill',school:'Enchantment',classes:['bard','sorcerer','warlock','wizard'],castingTime:'1 action',range:'60 feet',components:'V',duration:'Instantaneous',description:'Utter a word of power that instantly kills one creature you can see within range if it has 100 HP or fewer.',tags:['damage']},{id:'prismatic-wall',name:'Prismatic Wall',school:'Abjuration',classes:['wizard'],castingTime:'1 action',range:'60 feet',components:'V, S',duration:'10 minutes',description:'Create a wall of shimmering, multicolored light up to 90 feet long, 30 feet high. Seven layers, each a different color with different effects. Must destroy layers in order to pass through.',tags:['protection','control']},{id:'shapechange',name:'Shapechange',school:'Transmutation',classes:['druid','wizard'],castingTime:'1 action',range:'Self',components:'V, S, M',duration:'Concentration, 1 hour',description:'Transform into any creature with CR equal to or less than your level. You gain the creature\'s game statistics but retain your own mental ability scores, hit points, and class features. Can change form as action.',tags:['transformation']},{id:'storm-of-vengeance',name:'Storm of Vengeance',school:'Conjuration',classes:['druid'],castingTime:'1 action',range:'Sight',components:'V, S',duration:'Concentration, 1 minute',description:'Create churning storm 360 feet across, 1 mile high. Each round, different effects occur: thunder damage, acid rain, lightning bolts, hailstones, and finally freezing rain and wind.',tags:['damage','control','aoe']},{id:'time-stop',name:'Time Stop',school:'Transmutation',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V',duration:'Instantaneous',description:'Briefly stop the flow of time for everyone but yourself. You take 1d4+1 turns in a row. Actions that affect another creature or its equipment end the spell immediately.',tags:['utility']},{id:'true-polymorph',name:'True Polymorph',school:'Transmutation',classes:['bard','warlock','wizard'],castingTime:'1 action',range:'30 feet',components:'V, S, M',duration:'Concentration, 1 hour',description:'Transform a creature into a different creature or object, or an object into a creature. Wis save for unwilling. If you concentrate for the full duration, transformation becomes permanent.',tags:['transformation']},{id:'true-resurrection',name:'True Resurrection',school:'Necromancy',classes:['cleric','druid'],castingTime:'1 hour',range:'Touch',components:'V, S, M',duration:'Instantaneous',description:'Return to life a creature that has died within the last 200 years. Provides a new body if original was destroyed. Restores all HP, neutralizes poisons, cures diseases, ends curses, restores any missing parts.',tags:['healing','resurrection']},{id:'weird',name:'Weird',school:'Illusion',classes:['wizard'],castingTime:'1 action',range:'120 feet',components:'V, S',duration:'Concentration, 1 minute',description:'Draw on the deepest fears of creatures within 30-foot radius sphere. Each creature makes Wis save or become frightened. Frightened creature takes 4d10 psychic damage at start of each turn. Repeat save at end of each turn.',tags:['damage','psychic','fear','illusion']},{id:'wish',name:'Wish',school:'Conjuration',classes:['sorcerer','wizard'],castingTime:'1 action',range:'Self',components:'V',duration:'Instantaneous',description:'The mightiest spell a mortal can cast. Can duplicate any spell of 8th level or lower, create objects worth up to 25,000 gp, grant resistance to a damage type, or state any other wish (GM determines outcome). Stress may prevent casting wish again.',tags:['utility']},],getSpellsByLevel(level){return this[level]||[];},getSpellsForClass(classId,maxLevel=9){const normalizedClass=classId.toLowerCase();const result={cantrips:[],spells:{}};result.cantrips=(this[0]||[]).filter(spell=>spell.classes.includes(normalizedClass));for(let level=1;level<=maxLevel;level++){const levelSpells=(this[level]||[]).filter(spell=>spell.classes.includes(normalizedClass));if(levelSpells.length>0){result.spells[level]=levelSpells;}}
return result;},getSpellByName(name){const normalizedName=name.toLowerCase().trim();for(let level=0;level<=9;level++){const spells=this[level]||[];const found=spells.find(spell=>spell.name.toLowerCase()===normalizedName||spell.id===normalizedName);if(found)return{...found,level};}
return null;},searchSpells(query,filters={}){const normalizedQuery=query.toLowerCase().trim();const results=[];const minLevel=filters.minLevel??0;const maxLevel=filters.maxLevel??9;const classFilter=filters.class?.toLowerCase();const schoolFilter=filters.school?.toLowerCase();const tagFilter=filters.tag?.toLowerCase();for(let level=minLevel;level<=maxLevel;level++){const spells=this[level]||[];for(const spell of spells){const matchesQuery=!normalizedQuery||spell.name.toLowerCase().includes(normalizedQuery)||spell.description.toLowerCase().includes(normalizedQuery);const matchesClass=!classFilter||spell.classes.includes(classFilter);const matchesSchool=!schoolFilter||spell.school.toLowerCase()===schoolFilter;const matchesTag=!tagFilter||spell.tags.includes(tagFilter);if(matchesQuery&&matchesClass&&matchesSchool&&matchesTag){results.push({...spell,level});}}}
return results;},getAllSchools(){const schools=new Set();for(let level=0;level<=9;level++){for(const spell of this[level]||[]){schools.add(spell.school);}}
return Array.from(schools).sort();},getAllTags(){const tags=new Set();for(let level=0;level<=9;level++){for(const spell of this[level]||[]){spell.tags.forEach(tag=>tags.add(tag));}}
return Array.from(tags).sort();},};const{isLocalEnvironment=false,API_BASE_URL,TOKEN_STORAGE_KEY,USER_STORAGE_KEY,}=window.DanddyConfig||{};const DEBUG_CLOUD=!!(window.DanddyConfig&&window.DanddyConfig.DEBUG);const CharacterCloudStorage=(window.CharacterCloudStorage={_spellsToStringArray(arr){if(!arr||!Array.isArray(arr))return[];return arr.map(item=>{if(typeof item==='object'&&item!==null&&item.name){return item.name;}
if(typeof item==='string'){return item;}
return String(item);});},_toAPIFormat(character){return window.DanddyCharacterMapper.fromManagerToBackend(character);},_fromAPIFormat(apiChar){return window.DanddyCharacterMapper.fromBackendToManager(apiChar);},_mapAlignment(alignment){if(!alignment)return null;const alignmentMap={'Lawful Good':'lawful_good','Neutral Good':'neutral_good','Chaotic Good':'chaotic_good','Lawful Neutral':'lawful_neutral','True Neutral':'true_neutral','Chaotic Neutral':'chaotic_neutral','Lawful Evil':'lawful_evil','Neutral Evil':'neutral_evil','Chaotic Evil':'chaotic_evil',};return alignmentMap[alignment]||null;},async _apiRequest(endpoint,options={}){const token=AuthService.getToken();if(!token){throw new Error('Not authenticated');}
const response=await fetch(`${API_BASE_URL}${endpoint}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...options.headers,},});if(response.status===401){AuthService.clearToken();if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}
throw new Error('Session expired. Please log in again.');}
if(!response.ok){const error=await response.json().catch(()=>({detail:'Unknown error'}));const detail=typeof error.detail==='string'?error.detail:JSON.stringify(error.detail||error);console.error('API error response:',error);throw new Error(detail||`API error: ${response.status}`);}
if(response.status===204){return null;}
return await response.json();},async getAll(){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Fetching all characters from API...');}
const apiChars=await this._apiRequest('/characters/');const characters=apiChars.map(c=>this._fromAPIFormat(c));if(DEBUG_CLOUD){console.log('☁️ CLOUD: Retrieved',characters.length,'characters');}
return characters;}catch(error){console.error('☁️ CLOUD ERROR: Failed to fetch characters:',error);throw error;}},async getById(id){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Fetching character',id);}
const apiChar=await this._apiRequest(`/characters/${id}`);return this._fromAPIFormat(apiChar);}catch(error){console.error('☁️ CLOUD ERROR: Failed to fetch character:',error);throw error;}},async add(character){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Creating character:',character.name);}
const apiData=this._toAPIFormat(character);const apiChar=await this._apiRequest('/characters/',{method:'POST',body:JSON.stringify(apiData),});const newChar=this._fromAPIFormat(apiChar);if(DEBUG_CLOUD){console.log('☁️ CLOUD: Character created with ID:',newChar.id);}
return newChar;}catch(error){console.error('☁️ CLOUD ERROR: Failed to create character:',error);throw error;}},async update(id,updates){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Updating character',id);}
const apiUpdates={};if(updates.name!==undefined)apiUpdates.name=updates.name;if(updates.level!==undefined)apiUpdates.level=updates.level;if(updates.experiencePoints!==undefined)apiUpdates.experience_points=updates.experiencePoints;if(updates.alignment!==undefined){const alignmentMap={'lg':'lawful_good','ng':'neutral_good','cg':'chaotic_good','ln':'lawful_neutral','n':'true_neutral','cn':'chaotic_neutral','le':'lawful_evil','ne':'neutral_evil','ce':'chaotic_evil'};apiUpdates.alignment=alignmentMap[updates.alignment]||updates.alignment;}
if(updates.abilities){const abilities=updates.abilities;if(abilities.str!==undefined)apiUpdates.strength=abilities.str;if(abilities.dex!==undefined)apiUpdates.dexterity=abilities.dex;if(abilities.con!==undefined)apiUpdates.constitution=abilities.con;if(abilities.int!==undefined)apiUpdates.intelligence=abilities.int;if(abilities.wis!==undefined)apiUpdates.wisdom=abilities.wis;if(abilities.cha!==undefined)apiUpdates.charisma=abilities.cha;}
if(updates.hitPoints?.max!==undefined)apiUpdates.hit_points_max=updates.hitPoints.max;if(updates.hitPoints?.current!==undefined)apiUpdates.hit_points_current=updates.hitPoints.current;if(updates.hitPoints?.temp!==undefined)apiUpdates.hit_points_temp=updates.hitPoints.temp;if(updates.armorClass!==undefined)apiUpdates.armor_class=updates.armorClass;if(updates.initiative!==undefined)apiUpdates.initiative=updates.initiative;if(updates.speed!==undefined)apiUpdates.speed=updates.speed;if(updates.skillProficiencies!==undefined)apiUpdates.skill_proficiencies=updates.skillProficiencies;if(updates.toolProficiencies!==undefined)apiUpdates.tool_proficiencies=updates.toolProficiencies;if(updates.languages!==undefined)apiUpdates.languages=updates.languages;if(updates.equipment!==undefined){apiUpdates.inventory=updates.equipment.map(item=>typeof item==='string'?{name:item}:item);}
if(updates.conditions!==undefined)apiUpdates.conditions=updates.conditions;if(updates.backstory!==undefined)apiUpdates.backstory=updates.backstory;if(updates.sex!==undefined)apiUpdates.sex=updates.sex;if(updates.asciiPortrait!==undefined)apiUpdates.ascii_portrait=updates.asciiPortrait;if(updates.originalPortraitUrl!==undefined)apiUpdates.original_portrait_url=updates.originalPortraitUrl;if(updates.customPortraitAscii!==undefined)apiUpdates.custom_portrait_ascii=updates.customPortraitAscii;if(updates.customPortraitCount!==undefined)apiUpdates.custom_portrait_count=updates.customPortraitCount;if(updates.portraitMetadata!==undefined)apiUpdates.portrait_metadata=updates.portraitMetadata;const apiChar=await this._apiRequest(`/characters/${id}`,{method:'PUT',body:JSON.stringify(apiUpdates),});const updatedChar=this._fromAPIFormat(apiChar);return updatedChar;}catch(error){console.error('☁️ CLOUD ERROR: Failed to update character:',error);throw error;}},async delete(id){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Deleting character',id);}
await this._apiRequest(`/characters/${id}`,{method:'DELETE'});if(DEBUG_CLOUD){console.log('☁️ CLOUD: Character deleted successfully');}
return true;}catch(error){console.error('☁️ CLOUD ERROR: Failed to delete character:',error);throw error;}},async duplicate(id){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Duplicating character',id);}
const apiChar=await this._apiRequest(`/characters/${id}/duplicate`,{method:'POST',});const duplicated=this._fromAPIFormat(apiChar);if(DEBUG_CLOUD){console.log('☁️ CLOUD: Character duplicated with ID:',duplicated.id);}
return duplicated;}catch(error){console.error('☁️ CLOUD ERROR: Failed to duplicate character:',error);throw error;}},async export(id){try{const character=await this.getById(id);return JSON.stringify(character,null,2);}catch(error){console.error('☁️ CLOUD ERROR: Failed to export character:',error);throw error;}},async import(jsonString){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Importing character from JSON');}
const character=JSON.parse(jsonString);delete character.id;delete character.ownerId;const result=await this.add(character);if(DEBUG_CLOUD){console.log('☁️ CLOUD: Character imported with ID:',result.id);}
return result;}catch(error){console.error('☁️ CLOUD ERROR: Failed to import character:',error);return null;}},generateId(){return`char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;},async shareCharacter(characterId,email){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Sharing character',characterId,'to',email);}
const result=await this._apiRequest(`/shares/character/${characterId}`,{method:'POST',body:JSON.stringify({to_email:email}),});if(DEBUG_CLOUD){console.log('☁️ CLOUD: Character shared successfully');}
return result;}catch(error){console.error('☁️ CLOUD ERROR: Failed to share character:',error);throw error;}},async getPendingShares(){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Fetching pending shares...');}
const shares=await this._apiRequest('/shares/pending');if(DEBUG_CLOUD){console.log('☁️ CLOUD: Found',shares.length,'pending shares');}
return shares;}catch(error){console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:',error);throw error;}},async acceptShare(shareId){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Accepting share',shareId);}
const result=await this._apiRequest(`/shares/${shareId}/accept`,{method:'POST',});if(DEBUG_CLOUD){console.log('☁️ CLOUD: Share accepted, new character ID:',result.character_id);}
return result;}catch(error){console.error('☁️ CLOUD ERROR: Failed to accept share:',error);throw error;}},async dismissShare(shareId){try{if(DEBUG_CLOUD){console.log('☁️ CLOUD: Dismissing share',shareId);}
await this._apiRequest(`/shares/${shareId}/dismiss`,{method:'POST',});if(DEBUG_CLOUD){console.log('☁️ CLOUD: Share dismissed');}}catch(error){console.error('☁️ CLOUD ERROR: Failed to dismiss share:',error);throw error;}},});const MigrationService=(window.MigrationService={LOCAL_STORAGE_KEY:(window.DanddyStorage&&window.DanddyStorage.STORAGE_KEY)||'dnd_characters',hasLocalCharacters(){const characters=this._getLocalCharacters();const userCharacters=characters.filter(c=>!window.DemoCharacters||!window.DemoCharacters.isDemo(c));return userCharacters.length>0;},hasDemoCharacters(){const characters=this._getLocalCharacters();if(!window.DemoCharacters)return false;return characters.some(c=>window.DemoCharacters.isDemo(c));},_getLocalCharacters(){return(window.DanddyStorage&&window.DanddyStorage.readAll())||(function(key){const data=localStorage.getItem(key);return data?JSON.parse(data):[];})(this.LOCAL_STORAGE_KEY);},getLocalCharacterCount(){const characters=this._getLocalCharacters();const userCharacters=characters.filter(c=>!window.DemoCharacters||!window.DemoCharacters.isDemo(c));return userCharacters.length;},getDemoCharacterCount(){const characters=this._getLocalCharacters();if(!window.DemoCharacters)return 0;return characters.filter(c=>window.DemoCharacters.isDemo(c)).length;},async migrateToCloud(options={}){const{includeDemoCharacters=false}=options;try{if(!AuthService.isAuthenticated()){throw new Error('Must be logged in to migrate characters');}
console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');let localCharacters=this._getLocalCharacters();if(!includeDemoCharacters&&window.DemoCharacters){localCharacters=localCharacters.filter(c=>!window.DemoCharacters.isDemo(c));}
console.log('📦 MIGRATION: Found',localCharacters.length,'characters to migrate');const results={total:localCharacters.length,success:0,failed:0,errors:[],};for(const character of localCharacters){try{console.log('📦 MIGRATION: Migrating',character.name);const charToMigrate={...character};delete charToMigrate.isDemo;if(charToMigrate.id&&String(charToMigrate.id).startsWith('demo_')){delete charToMigrate.id;}
await CharacterCloudStorage.add(charToMigrate);results.success++;}catch(error){console.error('📦 MIGRATION ERROR: Failed to migrate',character.name,error);results.failed++;results.errors.push({character:character.name,error:error.message});}}
console.log('📦 MIGRATION: Complete!',results.success,'succeeded,',results.failed,'failed');return results;}catch(error){console.error('📦 MIGRATION ERROR:',error);throw error;}},backupLocalStorage(){const chars=(window.DanddyStorage&&window.DanddyStorage.readAll())||(function(key){const data=localStorage.getItem(key);return data?JSON.parse(data):[];})(this.LOCAL_STORAGE_KEY);if(chars&&chars.length){const backup={timestamp:new Date().toISOString(),characters:chars,};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`dnd-characters-backup-${Date.now()}.json`;a.click();URL.revokeObjectURL(url);console.log('📦 BACKUP: Created backup of',backup.characters.length,'characters');return true;}
return false;},clearLocalStorage(){if(window.DanddyStorage){window.DanddyStorage.clearAll();}else{localStorage.removeItem(this.LOCAL_STORAGE_KEY);try{localStorage.removeItem(this.LOCAL_STORAGE_KEY+'_cache');}catch(e){console.warn('📦 CLEAR: Failed to clear local cache key',e);}}
if(DEBUG_CLOUD){console.log('📦 CLEAR: Cleared local character storage (including cache, if present)');}},});if(DEBUG_CLOUD){console.log('☁️ Character Manager Cloud API Service loaded');}
(function(global){const DEMO_PREFIX='demo_';const DEMO_MIGRATION_ASKED_KEY='danddy_demo_migration_asked';const DEMO_MAX_USER_CHARACTERS=3;let _asciiCache={};let _demoCharactersCache=null;let _asciiLoadPromise=null;let _apiDemoCharacters=null;let _apiDemoFetchPromise=null;const DemoCharacters=(global.DemoCharacters={DEMO_PREFIX,DEMO_MIGRATION_ASKED_KEY,DEMO_MAX_USER_CHARACTERS,async _loadAscii(race,classType){const raceLower=String(race).toLowerCase().replace(/\s+/g,'-');const classLower=String(classType).toLowerCase().replace(/\s+/g,'-');const key=`${raceLower}-${classLower}`;if(_asciiCache[key])return _asciiCache[key];const paths=[`generated_portraits/ascii/${key}.txt`,`./generated_portraits/ascii/${key}.txt`,`../generated_portraits/ascii/${key}.txt`,];for(const path of paths){try{const response=await fetch(path);if(response.ok){const ascii=await response.text();_asciiCache[key]=ascii;return ascii;}}catch(e){}}
return null;},async loadAsciiForAllDemoCharacters(){if(_asciiLoadPromise)return _asciiLoadPromise;_asciiLoadPromise=(async()=>{const characters=this.getAll();console.log('DemoCharacters: Loading ASCII art for',characters.length,'demo characters...');let loadedCount=0;let skippedCount=0;const loadPromises=characters.map(async(char)=>{if(char.asciiPortrait){skippedCount++;console.log(`  ⏭️ Skipped ${char.name} (already has ASCII art)`);return;}
if(!char.race||!char.class)return;const ascii=await this._loadAscii(char.race,char.class);if(ascii){char.asciiPortrait=ascii;char.asciiPortraitKey=`${char.race}|${char.class}`;loadedCount++;console.log(`  ✅ Loaded ASCII for ${char.name} (${char.race}-${char.class})`);}else{console.warn(`  ❌ Failed to load ASCII for ${char.name} (${char.race}-${char.class})`);}});await Promise.all(loadPromises);console.log(`DemoCharacters: ASCII art loaded for ${loadedCount} / skipped ${skippedCount} / total ${characters.length} demo characters`);})();return _asciiLoadPromise;},_clearCache(){_demoCharactersCache=null;_asciiCache={};_asciiLoadPromise=null;_apiDemoCharacters=null;_apiDemoFetchPromise=null;},async fetchFromApi(){if(_apiDemoFetchPromise)return _apiDemoFetchPromise;_apiDemoFetchPromise=(async()=>{try{const apiBase=global.DanddyConfig?.BACKEND_ORIGIN||'https://danddy-api.onrender.com';console.log('DemoCharacters: Fetching demo characters from API...');const response=await fetch(`${apiBase}/api/characters/demo/list`);if(!response.ok){console.warn('DemoCharacters: API returned',response.status);return null;}
const apiChars=await response.json();console.log(`DemoCharacters: Fetched ${apiChars.length} demo characters from API`);_apiDemoCharacters=apiChars.map(char=>this._transformApiCharacter(char));return _apiDemoCharacters;}catch(err){console.warn('DemoCharacters: Failed to fetch from API:',err.message);return null;}})();return _apiDemoFetchPromise;},_transformApiCharacter(apiChar){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}${apiChar.id}`,isDemo:true,characterUid:`${DEMO_PREFIX}${apiChar.id}`,name:apiChar.name,race:apiChar.race,class:apiChar.character_class,background:apiChar.background,alignment:apiChar.alignment,sex:apiChar.sex,level:apiChar.level||1,abilities:{str:apiChar.strength,dex:apiChar.dexterity,con:apiChar.constitution,int:apiChar.intelligence,wis:apiChar.wisdom,cha:apiChar.charisma,},hitPoints:apiChar.hit_points_max,armorClass:apiChar.armor_class,initiative:apiChar.initiative,speed:apiChar.speed,skillProficiencies:apiChar.skill_proficiencies||[],savingThrows:apiChar.saving_throw_proficiencies||[],languages:apiChar.languages||[],toolProficiencies:apiChar.tool_proficiencies||[],spellcastingAbility:apiChar.spellcasting_ability,cantrips:apiChar.cantrips||[],spellsKnown:apiChar.spells_known||[],spellSlots:apiChar.spell_slots||{},backstory:apiChar.backstory,personalityTrait:apiChar.personality_traits,originalPortraitUrl:apiChar.original_portrait_url,asciiPortrait:apiChar.custom_portrait_ascii||apiChar.ascii_portrait,createdAt:apiChar.created_at||nowIso,updatedAt:apiChar.updated_at||nowIso,};},isDemo(character){return character&&(character.isDemo===true||(character.id&&String(character.id).startsWith(DEMO_PREFIX)));},isDemoMode(){return!(global.AuthService&&typeof AuthService.isAuthenticated==='function'&&AuthService.isAuthenticated());},hasMigrationBeenAsked(){return localStorage.getItem(DEMO_MIGRATION_ASKED_KEY)==='true';},markMigrationAsked(){localStorage.setItem(DEMO_MIGRATION_ASKED_KEY,'true');},clearMigrationAsked(){localStorage.removeItem(DEMO_MIGRATION_ASKED_KEY);},getAll(){if(_apiDemoCharacters&&_apiDemoCharacters.length>0){return _apiDemoCharacters;}
if(!_demoCharactersCache){_demoCharactersCache=[this._createLyra(),this._createThorgrim(),this._createZephyr(),this._createSienna(),this._createKrazul(),];}
return _demoCharactersCache;},async getAllAsync(){const apiChars=await this.fetchFromApi();if(apiChars&&apiChars.length>0){return apiChars;}
return this.getAll();},getDemoCharacterCount(){const localChars=(global.DanddyStorage&&global.DanddyStorage.readAll())||[];return localChars.filter(c=>this.isDemo(c)).length;},getUserCharacterCount(){const localChars=(global.DanddyStorage&&global.DanddyStorage.readAll())||[];return localChars.filter(c=>!this.isDemo(c)).length;},hasReachedCharacterLimit(){if(!this.isDemoMode())return false;return this.getUserCharacterCount()>=DEMO_MAX_USER_CHARACTERS;},canGenerateCustomArt(character){if(this.isDemo(character)){return false;}
return true;},_createLyra(){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}lyra`,isDemo:true,characterUid:`${DEMO_PREFIX}lyra_starwhisper`,name:'Lyra Starwhisper',race:'elf',class:'wizard',background:'sage',alignment:'ng',sex:'female',level:5,abilities:{str:8,dex:14,con:13,int:17,wis:12,cha:10,},baseAbilities:{str:8,dex:12,con:13,int:17,wis:12,cha:10,},hitPoints:27,armorClass:12,initiative:2,speed:30,proficiencyBonus:3,abilityModifiers:{str:-1,dex:2,con:1,int:3,wis:1,cha:0,},skillProficiencies:['arcana','history','investigation','insight'],skillModifiers:{arcana:6,history:6,investigation:6,insight:4,perception:3,},savingThrows:['int','wis'],savingThrowModifiers:{str:-1,dex:2,con:1,int:6,wis:4,cha:0,},languages:['Common','Elvish','Draconic','Celestial'],equipment:['Spellbook','Arcane focus (crystal orb)','Scholar\'s pack','Dagger','Component pouch','Bottle of black ink','Quill','Robes',],spellcastingAbility:'int',cantrips:['Fire Bolt','Mage Hand','Prestidigitation','Light'],spellsKnown:['Magic Missile','Shield','Detect Magic','Mage Armor','Misty Step','Hold Person','Fireball','Counterspell',],spellSlots:{1:4,2:3,3:2,},raceData:{name:'Elf',size:'Medium',speed:30,traits:['Darkvision','Keen Senses','Fey Ancestry','Trance'],languages:['Common','Elvish'],},classData:{name:'Wizard',hitDie:6,primaryAbility:['int'],savingThrows:['int','wis'],spellcaster:true,},backgroundData:{name:'Sage',feature:{name:'Researcher',description:'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it.',},},backstory:'Lyra spent decades studying in the Silverspire Academy, where she discovered an ancient tome that hinted at forgotten magic from before the Sundering. Now she travels the realm, seeking fragments of lost arcane knowledge.',personalityTrait:'I\'m convinced there\'s a logical explanation for everything, and I won\'t rest until I find it.',createdAt:nowIso,updatedAt:nowIso,};},_createThorgrim(){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}thorgrim`,isDemo:true,characterUid:`${DEMO_PREFIX}thorgrim_ironforge`,name:'Thorgrim Ironforge',race:'dwarf',class:'fighter',background:'soldier',alignment:'lg',sex:'male',level:3,abilities:{str:16,dex:12,con:16,int:10,wis:13,cha:8,},baseAbilities:{str:16,dex:12,con:14,int:10,wis:13,cha:8,},hitPoints:31,armorClass:18,initiative:1,speed:25,proficiencyBonus:2,abilityModifiers:{str:3,dex:1,con:3,int:0,wis:1,cha:-1,},skillProficiencies:['athletics','intimidation','perception','survival'],skillModifiers:{athletics:5,intimidation:1,perception:3,survival:3,},savingThrows:['str','con'],savingThrowModifiers:{str:5,dex:1,con:5,int:0,wis:1,cha:-1,},languages:['Common','Dwarvish'],equipment:['Chain mail','Shield','Battleaxe','Handaxes (2)','Explorer\'s pack','Insignia of rank','Trophy from fallen enemy','Bone dice',],raceData:{name:'Dwarf',size:'Medium',speed:25,traits:['Darkvision','Dwarven Resilience','Stonecunning'],languages:['Common','Dwarvish'],},classData:{name:'Fighter',hitDie:10,primaryAbility:['str','dex'],savingThrows:['str','con'],spellcaster:false,},backgroundData:{name:'Soldier',feature:{name:'Military Rank',description:'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence.',},},backstory:'Thorgrim served twenty years in the Ironforge Legion, defending the mountain holds from orc raids and goblin incursions. After the Battle of Redstone Pass, where he was the sole survivor of his unit, he set out to forge his own legend.',personalityTrait:'I face problems head-on. A simple, direct solution is the best path to success.',createdAt:nowIso,updatedAt:nowIso,};},_createZephyr(){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}zephyr`,isDemo:true,characterUid:`${DEMO_PREFIX}zephyr_nightshade`,name:'Zephyr Nightshade',race:'tiefling',class:'rogue',background:'criminal',alignment:'cn',sex:'non-binary',level:4,abilities:{str:10,dex:17,con:12,int:14,wis:10,cha:15,},baseAbilities:{str:10,dex:17,con:12,int:13,wis:10,cha:13,},hitPoints:27,armorClass:14,initiative:3,speed:30,proficiencyBonus:2,abilityModifiers:{str:0,dex:3,con:1,int:2,wis:0,cha:2,},skillProficiencies:['acrobatics','deception','sleight-of-hand','stealth','perception','persuasion'],skillModifiers:{acrobatics:5,deception:4,'sleight-of-hand':7,stealth:7,perception:2,persuasion:4,},savingThrows:['dex','int'],savingThrowModifiers:{str:0,dex:5,con:1,int:4,wis:0,cha:2,},languages:['Common','Infernal','Thieves\' Cant'],toolProficiencies:['Thieves\' tools','Playing cards'],equipment:['Leather armor','Rapier','Shortbow','Arrows (20)','Thieves\' tools','Burglar\'s pack','Crowbar','Dark hooded cloak',],raceData:{name:'Tiefling',size:'Medium',speed:30,traits:['Darkvision','Hellish Resistance','Infernal Legacy'],languages:['Common','Infernal'],},classData:{name:'Rogue',hitDie:8,primaryAbility:['dex'],savingThrows:['dex','int'],spellcaster:false,},backgroundData:{name:'Criminal',feature:{name:'Criminal Contact',description:'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances.',},},backstory:'Zephyr grew up on the streets of Waterdeep, their infernal appearance making them an outcast from birth. They learned to survive through cunning and quick fingers, eventually joining the Shadow Thieves. Now they work independently, taking jobs that interest them and staying one step ahead of the law.',personalityTrait:'I have a joke for every occasion, especially occasions where humor is inappropriate.',createdAt:nowIso,updatedAt:nowIso,};},_createSienna(){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}sienna`,isDemo:true,characterUid:`${DEMO_PREFIX}sienna_dawnbringer`,name:'Sienna Dawnbringer',race:'human',class:'cleric',background:'acolyte',alignment:'lg',sex:'female',level:4,abilities:{str:12,dex:10,con:14,int:11,wis:17,cha:14,},baseAbilities:{str:11,dex:9,con:13,int:10,wis:16,cha:13,},hitPoints:31,armorClass:18,initiative:0,speed:30,proficiencyBonus:2,abilityModifiers:{str:1,dex:0,con:2,int:0,wis:3,cha:2,},skillProficiencies:['insight','medicine','religion','persuasion'],skillModifiers:{insight:5,medicine:5,religion:2,persuasion:4,},savingThrows:['wis','cha'],savingThrowModifiers:{str:1,dex:0,con:2,int:0,wis:5,cha:4,},languages:['Common','Celestial','Elvish'],equipment:['Chain mail','Shield','Mace','Holy symbol of Lathander','Prayer book','Incense sticks (5)','Vestments','Healer\'s kit',],spellcastingAbility:'wis',cantrips:['Sacred Flame','Spare the Dying','Guidance'],spellsKnown:['Cure Wounds','Bless','Shield of Faith','Healing Word','Lesser Restoration','Spiritual Weapon','Prayer of Healing',],spellSlots:{1:4,2:3,},raceData:{name:'Human',size:'Medium',speed:30,traits:['Extra Language','Versatile (+1 to all abilities)'],languages:['Common','one extra'],},classData:{name:'Cleric',hitDie:8,primaryAbility:['wis'],savingThrows:['wis','cha'],spellcaster:true,},backgroundData:{name:'Acolyte',feature:{name:'Shelter of the Faithful',description:'You can receive free healing and care at temples of your faith, and you can call upon priests for assistance.',},},backstory:'Sienna was orphaned during a plague that swept through her village. Taken in by the Temple of Lathander, she devoted her life to ensuring no one else would suffer as she had. Now she travels the land, bringing hope and healing wherever darkness threatens.',personalityTrait:'I see omens in every event and action. The gods are always speaking to us, we just need to listen.',createdAt:nowIso,updatedAt:nowIso,};},_createKrazul(){const nowIso=new Date().toISOString();return{id:`${DEMO_PREFIX}krazul`,isDemo:true,characterUid:`${DEMO_PREFIX}krazul_stormscale`,name:'Krazul Stormscale',race:'dragonborn',class:'paladin',background:'noble',alignment:'lg',sex:'male',level:5,abilities:{str:17,dex:10,con:14,int:10,wis:12,cha:16,},baseAbilities:{str:15,dex:10,con:14,int:10,wis:12,cha:15,},hitPoints:44,armorClass:18,initiative:0,speed:30,proficiencyBonus:3,abilityModifiers:{str:3,dex:0,con:2,int:0,wis:1,cha:3,},skillProficiencies:['athletics','intimidation','persuasion','history'],skillModifiers:{athletics:6,intimidation:6,persuasion:6,history:3,},savingThrows:['wis','cha'],savingThrowModifiers:{str:3,dex:0,con:2,int:0,wis:4,cha:6,},languages:['Common','Draconic'],equipment:['Plate armor','Shield','Longsword','Javelins (5)','Holy symbol embedded in shield','Signet ring of House Stormscale','Fine clothes',],spellcastingAbility:'cha',cantrips:[],spellsKnown:['Divine Smite','Thunderous Smite','Shield of Faith','Cure Wounds','Command','Find Steed',],spellSlots:{1:4,2:2,},raceData:{name:'Dragonborn',size:'Medium',speed:30,traits:['Draconic Ancestry (Blue)','Breath Weapon (Lightning)','Damage Resistance (Lightning)'],languages:['Common','Draconic'],},classData:{name:'Paladin',hitDie:10,primaryAbility:['str','cha'],savingThrows:['wis','cha'],spellcaster:true,},backgroundData:{name:'Noble',feature:{name:'Position of Privilege',description:'Thanks to your noble birth, people are inclined to think the best of you. Common folk make every effort to accommodate you.',},},backstory:'Krazul hails from an ancient dragonborn clan that once served as dragon knights in a forgotten empire. When his clan\'s honor was questioned by corrupt nobles, he swore an oath to restore their name through righteous deeds. His lightning breath crackles with ancestral power.',personalityTrait:'My favor, once lost, is lost forever. But my loyalty, once earned, is unshakeable.',createdAt:nowIso,updatedAt:nowIso,};},});})(window);(function(){const DEBUG_STORAGE=!!(window.DanddyConfig&&window.DanddyConfig.DEBUG);const CharacterStorage=(window.CharacterStorage={STORAGE_KEY:(window.DanddyStorage&&window.DanddyStorage.STORAGE_KEY)||'dnd_characters',useCloud(){return(window.AuthService&&typeof AuthService.isAuthenticated==='function'?AuthService.isAuthenticated():false);},async getAll(){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Fetching all characters from cloud...');}
return await window.CharacterCloudStorage.getAll();}catch(error){if(error.message&&error.message.includes('Session expired')){console.warn('☁️ STORAGE: Session expired during getAll, dispatching event');const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'api_401',operation:'getAll'},});window.dispatchEvent(event);throw error;}
console.error('☁️ STORAGE: Cloud getAll failed, falling back to local:',error,);if(typeof window.showNotification==='function'){window.showNotification('⚠️ Cloud sync failed. Showing local characters instead.',);}
return this._getLocalAll();}}
return this._getLocalAll();},async getById(id){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Fetching character from cloud:',id);}
return await window.CharacterCloudStorage.getById(id);}catch(error){if(error.message&&error.message.includes('Session expired')){console.warn('☁️ STORAGE: Session expired during getById, dispatching event');const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'api_401',operation:'getById'},});window.dispatchEvent(event);throw error;}
console.error('☁️ STORAGE: Cloud getById failed, falling back to local:',error,);return this._getLocalById(id);}}
return this._getLocalById(id);},async add(character){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Creating character in cloud:',character);}
return await window.CharacterCloudStorage.add(character);}catch(error){if(error.message&&error.message.includes('Session expired')){console.warn('☁️ STORAGE: Session expired during add, dispatching event');const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'api_401',operation:'add'},});window.dispatchEvent(event);throw error;}
console.error('☁️ STORAGE: Cloud add failed:',error);if(typeof window.showNotification==='function'){window.showNotification('❌ Failed to save to cloud. Saving locally instead.',);}}}
return this._localAdd(character);},async update(id,updates,options={}){const{silent=false}=options;const idStr=String(id);if(this.useCloud()&&window.CharacterCloudStorage){const isInvalidCloudId=!idStr||idStr==='null'||idStr==='undefined'||idStr.startsWith('local_');if(isInvalidCloudId){if(DEBUG_STORAGE){console.warn('⚠️ STORAGE: Skipping cloud update for invalid id; using local instead:',id,);}
return this._localUpdate(id,updates,{silent});}
try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Updating character in cloud:',id);}
return await window.CharacterCloudStorage.update(id,updates);}catch(error){if(error.message&&error.message.includes('Session expired')){console.warn('☁️ STORAGE: Session expired during update, dispatching event');const event=new CustomEvent('danddy:sessionExpired',{detail:{reason:'api_401',operation:'update'},});window.dispatchEvent(event);throw error;}
console.error('☁️ STORAGE: Cloud update failed:',error);if(typeof window.showNotification==='function'){window.showNotification('❌ Failed to update in cloud. Your changes may not be synced.',);}
throw error;}}
return this._localUpdate(id,updates,{silent});},async delete(id){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Deleting character from cloud:',id);}
await window.CharacterCloudStorage.delete(id);return true;}catch(error){console.error('☁️ STORAGE: Cloud delete failed:',error);if(typeof window.showNotification==='function'){window.showNotification('❌ Failed to delete from cloud. Please try again.',);}
throw error;}}
return this._localDelete(id);},async duplicate(id){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Duplicating character in cloud:',id);}
return await window.CharacterCloudStorage.duplicate(id);}catch(error){console.error('☁️ STORAGE: Cloud duplicate failed:',error);if(typeof window.showNotification==='function'){window.showNotification('❌ Failed to duplicate in cloud. Please try again.',);}
throw error;}}
return this._localDuplicate(id);},async export(id){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Exporting character from cloud:',id);}
return await window.CharacterCloudStorage.export(id);}catch(error){console.error('☁️ STORAGE: Cloud export failed, falling back to local:',error);const character=this._getLocalById(id);return character?JSON.stringify(character,null,2):null;}}
const character=this._getLocalById(id);return character?JSON.stringify(character,null,2):null;},async import(jsonString){if(this.useCloud()&&window.CharacterCloudStorage){try{if(DEBUG_STORAGE){console.log('☁️ STORAGE: Importing character to cloud...');}
return await window.CharacterCloudStorage.import(jsonString);}catch(error){console.error('☁️ STORAGE: Cloud import failed:',error);if(typeof window.showNotification==='function'){window.showNotification('❌ Failed to import to cloud. Please try again.',);}
return null;}}
return this._localImport(jsonString);},generateId(){return`char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;},_getLocalAll(){let characters=(window.DanddyStorage&&window.DanddyStorage.readAll())||(function(){try{const data=localStorage.getItem(CharacterStorage.STORAGE_KEY);return data?JSON.parse(data):[];}catch{return[];}})();if(DEBUG_STORAGE){console.log('💾 LOCAL.GETALL: Retrieved',characters.length,'characters from local storage',);}
let changed=false;let maxExistingTime=0;characters.forEach((char)=>{const t=new Date(char.updatedAt||char.createdAt||0).getTime();if(t>maxExistingTime){maxExistingTime=t;}});const baseTime=maxExistingTime||Date.now();let newCounter=0;characters.forEach((char)=>{if(window.DemoCharacters&&window.DemoCharacters.isDemo(char)){return;}
if(!char.createdAt){newCounter+=1;const t=baseTime+newCounter*1000;char.createdAt=new Date(t).toISOString();changed=true;}
if(!char.updatedAt){char.updatedAt=char.createdAt;changed=true;}});if(changed){try{const charsToSave=characters.filter(c=>!window.DemoCharacters||!window.DemoCharacters.isDemo(c));localStorage.setItem(this.STORAGE_KEY,JSON.stringify(charsToSave),);}catch(e){console.warn('LOCAL.GETALL: Failed to persist normalized timestamps',e);}}
if(!this.useCloud()&&window.DemoCharacters){const demoChars=window.DemoCharacters.getAll();const existingDemoIds=new Set(characters.filter(c=>window.DemoCharacters.isDemo(c)).map(c=>c.id));demoChars.forEach(demo=>{if(!existingDemoIds.has(demo.id)){characters.push(demo);}});}
return characters;},_getLocalById(id){const characters=this._getLocalAll();const idStr=String(id);return characters.find((char)=>char&&String(char.id)===idStr);},_localSaveAll(characters){const charsToSave=characters.filter(c=>!window.DemoCharacters||!window.DemoCharacters.isDemo(c));if(DEBUG_STORAGE){console.log('💾 LOCAL.SAVEALL: Saving',charsToSave.length,'characters to local storage (excluding demo)',);}
if(window.DanddyStorage){window.DanddyStorage.writeAll(charsToSave);}else{try{localStorage.setItem(this.STORAGE_KEY,JSON.stringify(charsToSave));}catch(e){console.warn('LOCAL.SAVEALL: Failed to write to localStorage',e);}}},_localAdd(character){if(DEBUG_STORAGE){console.log('💾 LOCAL.ADD: Adding character:',character.name);}
const characters=this._getLocalAll();const nowIso=new Date().toISOString();const withId={...character,id:character.id||this.generateId(),createdAt:character.createdAt||nowIso,updatedAt:character.updatedAt||nowIso,};characters.push(withId);this._localSaveAll(characters);return withId;},_localUpdate(id,updates,options={}){const{silent=false}=options;const characters=this._getLocalAll();const idStr=String(id);const index=characters.findIndex((char)=>char&&String(char.id)===idStr);if(index===-1)return null;const prev=characters[index];const next={...prev,...updates,...(silent?{}:{updatedAt:new Date().toISOString()}),};characters[index]=next;this._localSaveAll(characters);return next;},_localDelete(id){if(DEBUG_STORAGE){console.log('🗑️ LOCAL.DELETE: Deleting character with ID:',id);}
const characters=this._getLocalAll();const idStr=String(id);const filtered=characters.filter((char)=>!char||String(char.id)!==idStr);this._localSaveAll(filtered);return filtered.length<characters.length;},_localDuplicate(id){const character=this._getLocalById(id);if(!character)return null;const nowIso=new Date().toISOString();const duplicate={...character,name:character.name?`${character.name} (Copy)`:'Copy',id:this.generateId(),createdAt:nowIso,updatedAt:nowIso,};const characters=this._getLocalAll();characters.push(duplicate);this._localSaveAll(characters);return duplicate;},_localImport(jsonString){try{if(DEBUG_STORAGE){console.log('📥 LOCAL.IMPORT: Starting import...');}
const character=JSON.parse(jsonString);if(!character||typeof character!=='object'){throw new Error('Invalid character JSON');}
delete character.id;const result=this._localAdd(character);if(DEBUG_STORAGE){console.log('📥 LOCAL.IMPORT: Imported character with new ID:',result.id,);}
return result;}catch(error){console.error('LOCAL.IMPORT: Failed to import character JSON',error);return null;}},});})();const isLocalDevelopment=(window.DanddyConfig&&window.DanddyConfig.isLocalEnvironment)||window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1'||window.location.protocol==='file:';const PRODUCTION_BACKEND_URL=(window.DanddyConfig&&window.DanddyConfig.BACKEND_ORIGIN)||'https://danddy-api.onrender.com';window.CONFIG={TYPEWRITER_SPEED:30,AI_TIMEOUT:40000,ENABLE_AI:true,ENABLE_AI_NARRATOR_COMMENTS:false,ENABLE_AI_OPTION_VARIATIONS:false,NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER:1,BACKEND_URL:PRODUCTION_BACKEND_URL,OPENAI_API_URL:'https://api.openai.com/v1/chat/completions',OPENAI_MODEL:'gpt-3.5-turbo',STORAGE_KEY:'dnd_characters',MAX_RETRIES:2,DEV_AUTO_LOGIN:isLocalDevelopment,DEV_CREDENTIALS:{email:'dev@test.com',password:'dev12345',role:'player',},PREGENERATED_PORTRAIT_BASE_URL:null,DEFAULT_IMAGE_MODEL:'gpt-image-1',DEFAULT_PORTRAIT_VIEW_MODE:'original',DEFAULT_PORTRAIT_PROMPT_THEME:'cinematic-inks',};window.DND_DATA={races:[{id:'human',name:'Human',description:'Versatile and ambitious, found in every corner of the world.',abilityBonuses:{str:1,dex:1,con:1,int:1,wis:1,cha:1},traits:['Extra Language','Versatile'],languages:['Common'],size:'Medium',speed:30,},{id:'elf',name:'Elf',description:'Graceful and long-lived, masters of magic and nature.',abilityBonuses:{dex:2},traits:['Darkvision','Keen Senses','Fey Ancestry','Trance'],languages:['Common','Elvish'],size:'Medium',speed:30,},{id:'dwarf',name:'Dwarf',description:'Stout and hardy, renowned craftsmen and warriors.',abilityBonuses:{con:2},traits:['Darkvision','Dwarven Resilience','Stonecunning'],languages:['Common','Dwarvish'],size:'Medium',speed:25,},{id:'halfling',name:'Halfling',description:'Small and nimble, lucky and brave despite their size.',abilityBonuses:{dex:2},traits:['Lucky','Brave','Halfling Nimbleness'],languages:['Common','Halfling'],size:'Small',speed:25,},{id:'dragonborn',name:'Dragonborn',description:'Draconic humanoids with breath weapons and scaled skin.',abilityBonuses:{str:2,cha:1},traits:['Draconic Ancestry','Breath Weapon','Damage Resistance'],languages:['Common','Draconic'],size:'Medium',speed:30,},{id:'gnome',name:'Gnome',description:'Clever and curious, lovers of knowledge and tinkering.',abilityBonuses:{int:2},traits:['Darkvision','Gnome Cunning'],languages:['Common','Gnomish'],size:'Small',speed:25,},{id:'half-elf',name:'Half-Elf',description:'Walking between two worlds, charismatic and adaptable.',abilityBonuses:{cha:2},traits:['Darkvision','Fey Ancestry','Skill Versatility'],languages:['Common','Elvish'],size:'Medium',speed:30,},{id:'half-orc',name:'Half-Orc',description:'Fierce and strong, proving themselves through deeds.',abilityBonuses:{str:2,con:1},traits:['Darkvision','Menacing','Relentless Endurance','Savage Attacks'],languages:['Common','Orc'],size:'Medium',speed:30,},{id:'tiefling',name:'Tiefling',description:'Infernal heritage grants dark powers and distinction.',abilityBonuses:{cha:2,int:1},traits:['Darkvision','Hellish Resistance','Infernal Legacy'],languages:['Common','Infernal'],size:'Medium',speed:30,},],classes:[{id:'fighter',name:'Fighter',description:'Master of martial combat, skilled with weapons and armor.',hitDie:10,primaryAbility:['str','dex'],savingThrows:['str','con'],equipment:['Martial weapons','Heavy armor','Shield'],},{id:'wizard',name:'Wizard',description:'Scholar of arcane magic, wielding powerful spells.',hitDie:6,primaryAbility:['int'],savingThrows:['int','wis'],equipment:['Spellbook','Component pouch','Robes'],},{id:'rogue',name:'Rogue',description:'Skilled in stealth and precision, master of skills.',hitDie:8,primaryAbility:['dex'],savingThrows:['dex','int'],equipment:['Light armor','Thieves\' tools','Rapier'],},{id:'cleric',name:'Cleric',description:'Divine spellcaster, channeling the power of a deity.',hitDie:8,primaryAbility:['wis'],savingThrows:['wis','cha'],equipment:['Medium armor','Shield','Holy symbol'],},{id:'ranger',name:'Ranger',description:'Wilderness warrior, tracker, and protector of nature.',hitDie:10,primaryAbility:['dex','wis'],savingThrows:['str','dex'],equipment:['Longbow','Leather armor','Survival gear'],},{id:'paladin',name:'Paladin',description:'Holy warrior sworn to an oath, wielding divine magic.',hitDie:10,primaryAbility:['str','cha'],savingThrows:['wis','cha'],equipment:['Heavy armor','Martial weapons','Holy symbol'],},{id:'barbarian',name:'Barbarian',description:'Fierce warrior who channels rage in battle.',hitDie:12,primaryAbility:['str'],savingThrows:['str','con'],equipment:['Greataxe','Medium armor','Javelins'],},{id:'bard',name:'Bard',description:'Inspiring performer who weaves magic through music.',hitDie:8,primaryAbility:['cha'],savingThrows:['dex','cha'],equipment:['Musical instrument','Light armor','Rapier'],},{id:'druid',name:'Druid',description:'Nature priest who can shapeshift and wield primal magic.',hitDie:8,primaryAbility:['wis'],savingThrows:['int','wis'],equipment:['Druidic focus','Leather armor','Wooden shield'],},{id:'monk',name:'Monk',description:'Martial artist who channels ki energy through their body.',hitDie:8,primaryAbility:['dex','wis'],savingThrows:['str','dex'],equipment:['Martial arts','Simple weapons','Unarmored defense'],},{id:'sorcerer',name:'Sorcerer',description:'Innate spellcaster with magic in their blood.',hitDie:6,primaryAbility:['cha'],savingThrows:['con','cha'],equipment:['Arcane focus','Light crossbow','Component pouch'],},{id:'warlock',name:'Warlock',description:'Pact-bound caster drawing power from otherworldly patrons.',hitDie:8,primaryAbility:['cha'],savingThrows:['wis','cha'],equipment:['Eldritch invocations','Light armor','Simple weapons'],},],backgrounds:[{id:'acolyte',name:'Acolyte',description:'Served in a temple to a deity or pantheon.',skillProficiencies:['insight','religion'],languages:2,equipment:['Holy symbol','Prayer book or prayer wheel','5 sticks of incense','Vestments','Common clothes','15 gp'],feature:{name:'Shelter of the Faithful',description:'You and your companions can receive free healing and care at temples, shrines, and other religious establishments of your faith. Those who share your religion will support you at a modest lifestyle and provide you with necessary (though not luxurious) assistance.'}},{id:'criminal',name:'Criminal',description:'Experienced in breaking the law and living outside society.',skillProficiencies:['deception','stealth'],toolProficiencies:['thieves-tools','gaming-set'],equipment:['Crowbar','Dark common clothes with hood','Belt pouch','15 gp'],feature:{name:'Criminal Contact',description:'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances, and you know the local messengers, corrupt officials, and fence who can help you.'}},{id:'folk-hero',name:'Folk Hero',description:'Champion of the common people, standing up against tyrants.',skillProficiencies:['animal-handling','survival'],toolProficiencies:['artisan-tools','vehicles-land'],equipment:['Set of artisan\'s tools','Shovel','Iron pot','Common clothes','Belt pouch','10 gp'],feature:{name:'Rustic Hospitality',description:'Since you come from the common folk, you fit in easily among them. You can find a place to hide, rest, or recuperate among commoners, who will shield you from the law or those hunting you (unless you show yourself to be a danger to them).'}},{id:'noble',name:'Noble',description:'Born to wealth and privilege, understanding power and hierarchy.',skillProficiencies:['history','persuasion'],toolProficiencies:['gaming-set'],languages:1,equipment:['Fine clothes','Signet ring','Scroll of pedigree','Purse','25 gp'],feature:{name:'Position of Privilege',description:'You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other nobles treat you as a member of the same social sphere.'}},{id:'sage',name:'Sage',description:'Researcher and scholar, devoted to learning and study.',skillProficiencies:['arcana','history'],languages:2,equipment:['Bottle of black ink','Quill','Small knife','Letter from dead colleague','Common clothes','10 gp'],feature:{name:'Researcher',description:'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it. Usually this comes from a library, scriptorium, university, or another sage or learned person.'}},{id:'soldier',name:'Soldier',description:'Trained warrior with experience in military campaigns.',skillProficiencies:['athletics','intimidation'],toolProficiencies:['gaming-set','vehicles-land'],equipment:['Insignia of rank','Trophy from fallen enemy','Bone dice or playing cards','Common clothes','10 gp'],feature:{name:'Military Rank',description:'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence. You can invoke your rank to influence soldiers and temporarily requisition simple equipment or horses.'}},{id:'outlander',name:'Outlander',description:'Grew up in the wilderness, far from civilization.',skillProficiencies:['athletics','survival'],toolProficiencies:['musical-instrument'],languages:1,equipment:['Staff','Hunting trap','Trophy from animal you killed','Traveler\'s clothes','10 gp'],feature:{name:'Wanderer',description:'You have excellent memory for maps and geography, and can always recall the general layout of terrain and settlements. You can find food and water for yourself and up to five others each day, provided the land offers berries, game, water, and so forth.'}},{id:'entertainer',name:'Entertainer',description:'Performer who thrives in front of an audience.',skillProficiencies:['acrobatics','performance'],toolProficiencies:['disguise-kit','musical-instrument'],equipment:['Musical instrument','Favor of an admirer (love letter or trinket)','Costume','Belt pouch','15 gp'],feature:{name:'By Popular Demand',description:'You can always find a place to perform (inn, tavern, circus, etc.). You receive free lodging and food of modest or comfortable standard as long as you perform each night. Your performance makes you a local figure, and strangers recognize you in any town where you\'ve performed.'}},],alignments:[{id:'lg',name:'Lawful Good',description:'Honor and compassion'},{id:'ng',name:'Neutral Good',description:'Kindness without bias'},{id:'cg',name:'Chaotic Good',description:'Freedom and kindness'},{id:'ln',name:'Lawful Neutral',description:'Order above all'},{id:'n',name:'True Neutral',description:'Balance and pragmatism'},{id:'cn',name:'Chaotic Neutral',description:'Freedom above all'},{id:'le',name:'Lawful Evil',description:'Methodical cruelty'},{id:'ne',name:'Neutral Evil',description:'Pure selfishness'},{id:'ce',name:'Chaotic Evil',description:'Destruction and malice'},],};window.SPELL_DATA={spellcastingClasses:{wizard:{ability:'int',cantripsKnown:3,spellsKnown:6,preparedSpells:'INT + level',spellSlots:{1:2},},sorcerer:{ability:'cha',cantripsKnown:4,spellsKnown:2,spellSlots:{1:2},},warlock:{ability:'cha',cantripsKnown:2,spellsKnown:2,spellSlots:{1:1},},bard:{ability:'cha',cantripsKnown:2,spellsKnown:4,spellSlots:{1:2},},cleric:{ability:'wis',cantripsKnown:3,preparedSpells:'WIS + level',spellSlots:{1:2},},druid:{ability:'wis',cantripsKnown:2,preparedSpells:'WIS + level',spellSlots:{1:2},},},cantrips:{wizard:[{id:'fire-bolt',name:'Fire Bolt',school:'Evocation',description:'Hurl a mote of fire at a creature or object. 1d10 fire damage.',tags:['damage','fire','offense'],},{id:'mage-hand',name:'Mage Hand',school:'Conjuration',description:'Create a spectral hand that can manipulate objects at range.',tags:['utility','manipulation'],},{id:'light',name:'Light',school:'Evocation',description:'Touch an object to make it shed bright light for 1 hour.',tags:['utility','light'],},{id:'ray-of-frost',name:'Ray of Frost',school:'Evocation',description:'Frigid beam dealing 1d8 cold damage and reducing speed.',tags:['damage','cold','offense','control'],},{id:'shocking-grasp',name:'Shocking Grasp',school:'Evocation',description:'Lightning damage on touch (1d8) and target cannot take reactions.',tags:['damage','lightning','offense'],},{id:'prestidigitation',name:'Prestidigitation',school:'Transmutation',description:'Minor magical trick: light a candle, clean clothes, flavor food.',tags:['utility','social'],},{id:'minor-illusion',name:'Minor Illusion',school:'Illusion',description:'Create a sound or image of an object within range.',tags:['utility','illusion','deception'],},],sorcerer:[{id:'fire-bolt',name:'Fire Bolt',school:'Evocation',description:'Hurl a mote of fire at a creature or object. 1d10 fire damage.',tags:['damage','fire','offense']},{id:'ray-of-frost',name:'Ray of Frost',school:'Evocation',description:'Frigid beam dealing 1d8 cold damage and reducing speed.',tags:['damage','cold','offense','control']},{id:'shocking-grasp',name:'Shocking Grasp',school:'Evocation',description:'Lightning damage on touch (1d8) and target cannot take reactions.',tags:['damage','lightning','offense']},{id:'light',name:'Light',school:'Evocation',description:'Touch an object to make it shed bright light for 1 hour.',tags:['utility','light']},{id:'mage-hand',name:'Mage Hand',school:'Conjuration',description:'Create a spectral hand that can manipulate objects at range.',tags:['utility','manipulation']},{id:'prestidigitation',name:'Prestidigitation',school:'Transmutation',description:'Minor magical trick: light a candle, clean clothes, flavor food.',tags:['utility','social']},{id:'minor-illusion',name:'Minor Illusion',school:'Illusion',description:'Create a sound or image of an object within range.',tags:['utility','illusion','deception']},],warlock:[{id:'eldritch-blast',name:'Eldritch Blast',school:'Evocation',description:'Beam of crackling energy dealing 1d10 force damage.',tags:['damage','force','offense']},{id:'mage-hand',name:'Mage Hand',school:'Conjuration',description:'Create a spectral hand that can manipulate objects at range.',tags:['utility','manipulation']},{id:'minor-illusion',name:'Minor Illusion',school:'Illusion',description:'Create a sound or image of an object within range.',tags:['utility','illusion','deception']},{id:'prestidigitation',name:'Prestidigitation',school:'Transmutation',description:'Minor magical trick: light a candle, clean clothes, flavor food.',tags:['utility','social']},{id:'chill-touch',name:'Chill Touch',school:'Necromancy',description:'Ghostly hand dealing 1d8 necrotic damage and preventing healing.',tags:['damage','necrotic','offense']},],bard:[{id:'vicious-mockery',name:'Vicious Mockery',school:'Enchantment',description:'Insult dealing 1d4 psychic damage and imposing disadvantage.',tags:['damage','psychic','debuff','social']},{id:'light',name:'Light',school:'Evocation',description:'Touch an object to make it shed bright light for 1 hour.',tags:['utility','light']},{id:'mage-hand',name:'Mage Hand',school:'Conjuration',description:'Create a spectral hand that can manipulate objects at range.',tags:['utility','manipulation']},{id:'prestidigitation',name:'Prestidigitation',school:'Transmutation',description:'Minor magical trick: light a candle, clean clothes, flavor food.',tags:['utility','social']},{id:'minor-illusion',name:'Minor Illusion',school:'Illusion',description:'Create a sound or image of an object within range.',tags:['utility','illusion','deception']},],cleric:[{id:'sacred-flame',name:'Sacred Flame',school:'Evocation',description:'Flame-like radiance dealing 1d8 radiant damage (Dex save).',tags:['damage','radiant','offense']},{id:'light',name:'Light',school:'Evocation',description:'Touch an object to make it shed bright light for 1 hour.',tags:['utility','light']},{id:'guidance',name:'Guidance',school:'Divination',description:'Touch a creature to grant +1d4 to one ability check.',tags:['buff','support']},{id:'spare-the-dying',name:'Spare the Dying',school:'Necromancy',description:'Touch a dying creature to stabilize it.',tags:['healing','support']},{id:'thaumaturgy',name:'Thaumaturgy',school:'Transmutation',description:'Minor wonder: amplify voice, flicker flames, open doors.',tags:['utility','social']},],druid:[{id:'produce-flame',name:'Produce Flame',school:'Conjuration',description:'Flickering flame for light or to throw (1d8 fire damage).',tags:['damage','fire','utility','light']},{id:'guidance',name:'Guidance',school:'Divination',description:'Touch a creature to grant +1d4 to one ability check.',tags:['buff','support']},{id:'shillelagh',name:'Shillelagh',school:'Transmutation',description:'Imbue a club or staff to use Wisdom for attacks (1d8 damage).',tags:['buff','combat']},{id:'druidcraft',name:'Druidcraft',school:'Transmutation',description:'Minor druidic effects: predict weather, bloom flowers, light fires.',tags:['utility','nature']},],},firstLevel:{wizard:[{id:'magic-missile',name:'Magic Missile',school:'Evocation',description:'Three darts of force, each dealing 1d4+1 damage (auto-hit).',tags:['damage','force','offense','reliable'],},{id:'shield',name:'Shield',school:'Abjuration',description:'Reaction: +5 AC until start of your next turn.',tags:['defense','protection','reaction'],},{id:'mage-armor',name:'Mage Armor',school:'Abjuration',description:'Set AC to 13 + Dex modifier for 8 hours.',tags:['defense','protection','buff'],},{id:'detect-magic',name:'Detect Magic',school:'Divination',description:'Sense magic within 30 feet for 10 minutes (concentration).',tags:['utility','detection','exploration'],},{id:'identify',name:'Identify',school:'Divination',description:'Learn properties of a magical object or spell affecting a creature.',tags:['utility','knowledge','exploration'],},{id:'sleep',name:'Sleep',school:'Enchantment',description:'Put 5d8 HP worth of creatures to sleep.',tags:['control','debuff','crowd-control'],},{id:'burning-hands',name:'Burning Hands',school:'Evocation',description:'Cone of fire dealing 3d6 fire damage (Dex save for half).',tags:['damage','fire','aoe','offense'],},{id:'disguise-self',name:'Disguise Self',school:'Illusion',description:'Make yourself look different for 1 hour.',tags:['utility','illusion','social','deception'],},{id:'feather-fall',name:'Feather Fall',school:'Transmutation',description:'Reaction: Up to 5 creatures fall slowly, taking no damage.',tags:['utility','protection','reaction'],},{id:'grease',name:'Grease',school:'Conjuration',description:'Slick grease covers a 10-foot square (Dex save or fall prone).',tags:['control','terrain','debuff'],},],sorcerer:[{id:'magic-missile',name:'Magic Missile',school:'Evocation',description:'Three darts of force, each dealing 1d4+1 damage (auto-hit).',tags:['damage','force','offense','reliable']},{id:'shield',name:'Shield',school:'Abjuration',description:'Reaction: +5 AC until start of your next turn.',tags:['defense','protection','reaction']},{id:'mage-armor',name:'Mage Armor',school:'Abjuration',description:'Set AC to 13 + Dex modifier for 8 hours.',tags:['defense','protection','buff']},{id:'burning-hands',name:'Burning Hands',school:'Evocation',description:'Cone of fire dealing 3d6 fire damage (Dex save for half).',tags:['damage','fire','aoe','offense']},{id:'chromatic-orb',name:'Chromatic Orb',school:'Evocation',description:'Hurl a 4-inch sphere dealing 3d8 damage (choose: acid, cold, fire, lightning, poison, thunder).',tags:['damage','versatile','offense']},{id:'disguise-self',name:'Disguise Self',school:'Illusion',description:'Make yourself look different for 1 hour.',tags:['utility','illusion','social','deception']},{id:'sleep',name:'Sleep',school:'Enchantment',description:'Put 5d8 HP worth of creatures to sleep.',tags:['control','debuff','crowd-control']},],warlock:[{id:'hex',name:'Hex',school:'Enchantment',description:'Curse a creature to take +1d6 necrotic damage and disadvantage on checks (1 hour, concentration).',tags:['damage','debuff','curse']},{id:'armor-of-agathys',name:'Armor of Agathys',school:'Abjuration',description:'Gain 5 temp HP; attackers take 5 cold damage when they hit you (1 hour).',tags:['defense','protection','retaliation']},{id:'arms-of-hadar',name:'Arms of Hadar',school:'Conjuration',description:'Tendrils deal 2d6 necrotic damage in 10-foot radius (Str save for half).',tags:['damage','necrotic','aoe','offense']},{id:'charm-person',name:'Charm Person',school:'Enchantment',description:'Charm a humanoid (Wis save) for 1 hour.',tags:['control','social','charm']},{id:'hellish-rebuke',name:'Hellish Rebuke',school:'Evocation',description:'Reaction: Attacker takes 2d10 fire damage (Dex save for half).',tags:['damage','fire','reaction','retaliation']},],bard:[{id:'healing-word',name:'Healing Word',school:'Evocation',description:'Bonus action: Heal a creature for 1d4 + spellcasting modifier.',tags:['healing','support','bonus-action']},{id:'cure-wounds',name:'Cure Wounds',school:'Evocation',description:'Touch to heal 1d8 + spellcasting modifier HP.',tags:['healing','support']},{id:'charm-person',name:'Charm Person',school:'Enchantment',description:'Charm a humanoid (Wis save) for 1 hour.',tags:['control','social','charm']},{id:'disguise-self',name:'Disguise Self',school:'Illusion',description:'Make yourself look different for 1 hour.',tags:['utility','illusion','social','deception']},{id:'faerie-fire',name:'Faerie Fire',school:'Evocation',description:'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).',tags:['buff','support','debuff']},{id:'sleep',name:'Sleep',school:'Enchantment',description:'Put 5d8 HP worth of creatures to sleep.',tags:['control','debuff','crowd-control']},{id:'thunderwave',name:'Thunderwave',school:'Evocation',description:'15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).',tags:['damage','thunder','aoe','control']},],cleric:[{id:'cure-wounds',name:'Cure Wounds',school:'Evocation',description:'Touch to heal 1d8 + spellcasting modifier HP.',tags:['healing','support']},{id:'healing-word',name:'Healing Word',school:'Evocation',description:'Bonus action: Heal a creature for 1d4 + spellcasting modifier.',tags:['healing','support','bonus-action']},{id:'bless',name:'Bless',school:'Enchantment',description:'Up to 3 creatures add 1d4 to attacks and saves (1 minute, concentration).',tags:['buff','support','team']},{id:'shield-of-faith',name:'Shield of Faith',school:'Abjuration',description:'Grant +2 AC to a creature (10 minutes, concentration).',tags:['buff','defense','support']},{id:'guiding-bolt',name:'Guiding Bolt',school:'Evocation',description:'Ranged attack dealing 4d6 radiant damage; next attack against target has advantage.',tags:['damage','radiant','offense','buff']},{id:'inflict-wounds',name:'Inflict Wounds',school:'Necromancy',description:'Melee attack dealing 3d10 necrotic damage.',tags:['damage','necrotic','offense']},{id:'sanctuary',name:'Sanctuary',school:'Abjuration',description:'Attackers must make Wis save or choose another target (1 minute).',tags:['defense','protection','support']},],druid:[{id:'cure-wounds',name:'Cure Wounds',school:'Evocation',description:'Touch to heal 1d8 + spellcasting modifier HP.',tags:['healing','support']},{id:'healing-word',name:'Healing Word',school:'Evocation',description:'Bonus action: Heal a creature for 1d4 + spellcasting modifier.',tags:['healing','support','bonus-action']},{id:'entangle',name:'Entangle',school:'Conjuration',description:'Grasping vines restrain creatures in 20-foot square (Str save, 1 minute, concentration).',tags:['control','terrain','debuff']},{id:'faerie-fire',name:'Faerie Fire',school:'Evocation',description:'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).',tags:['buff','support','debuff']},{id:'goodberry',name:'Goodberry',school:'Transmutation',description:'Create 10 berries that each restore 1 HP and provide nourishment (24 hours).',tags:['healing','utility','support']},{id:'thunderwave',name:'Thunderwave',school:'Evocation',description:'15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).',tags:['damage','thunder','aoe','control']},{id:'speak-with-animals',name:'Speak with Animals',school:'Divination',description:'Communicate with beasts for 10 minutes.',tags:['utility','social','nature']},],},getCantripsForClass(classId){return this.cantrips[classId]||[];},getFirstLevelSpellsForClass(classId){return this.firstLevel[classId]||[];},getSpellcastingConfig(classId){return this.spellcastingClasses[classId]||null;},isSpellcaster(classId){return!!this.spellcastingClasses[classId];},getQuickModeSpells(classId){const config=this.getSpellcastingConfig(classId);if(!config)return null;const cantrips=this.getCantripsForClass(classId);const firstLevel=this.getFirstLevelSpellsForClass(classId);const result={cantrips:[],firstLevel:[],};switch(classId){case'wizard':result.cantrips=[cantrips[0],cantrips[1],cantrips[2]];result.firstLevel=[firstLevel[0],firstLevel[1],firstLevel[2],firstLevel[3],firstLevel[4],firstLevel[5],];break;case'sorcerer':result.cantrips=[cantrips[0],cantrips[1],cantrips[4],cantrips[5]];result.firstLevel=[firstLevel[0],firstLevel[1]];break;case'warlock':result.cantrips=[cantrips[0],cantrips[1]];result.firstLevel=[firstLevel[0],firstLevel[1]];break;case'bard':result.cantrips=[cantrips[0],cantrips[4]];result.firstLevel=[firstLevel[0],firstLevel[1],firstLevel[2],firstLevel[3]];break;case'cleric':result.cantrips=[cantrips[0],cantrips[2],cantrips[3]];result.firstLevel=[firstLevel[0],firstLevel[1],firstLevel[2]];break;case'druid':result.cantrips=[cantrips[0],cantrips[1]];result.firstLevel=[firstLevel[0],firstLevel[2],firstLevel[3]];break;}
return result;},getGuidedSpells(classId,preferences){const config=this.getSpellcastingConfig(classId);if(!config)return null;const cantrips=this.getCantripsForClass(classId);const firstLevel=this.getFirstLevelSpellsForClass(classId);const filterByTags=(spells,preferredTags,count)=>{const tagged=spells.map(spell=>{const matchCount=spell.tags.filter(tag=>preferredTags.includes(tag)).length;return{spell,matchCount};});tagged.sort((a,b)=>b.matchCount-a.matchCount);return tagged.slice(0,count).map(item=>item.spell);};const preferredTags=[];if(preferences.style==='offense')preferredTags.push('damage','offense');if(preferences.style==='defense')preferredTags.push('defense','protection','healing','support');if(preferences.style==='control')preferredTags.push('control','debuff','crowd-control');if(preferences.style==='utility')preferredTags.push('utility','social','exploration');if(preferences.element)preferredTags.push(preferences.element);const result={cantrips:filterByTags(cantrips,preferredTags,config.cantripsKnown),firstLevel:[],};if(config.spellsKnown){result.firstLevel=filterByTags(firstLevel,preferredTags,config.spellsKnown);}else if(config.preparedSpells){result.firstLevel=filterByTags(firstLevel,preferredTags,3);}
return result;},};const NARRATORS=(window.NARRATORS={deadpan:{id:'deadpan',name:'The Deadpan Observer',emoji:'( ._. )',description:'Dry, witty, and occasionally breaks the fourth wall',systemPrompt:'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Ah. Another soul seeking adventure. Or at least, trying to.\n>  \n>  Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.\n>  \n>  Let's start with something easy...`,completeText:"Well. That's done. Your character is ready. Try not to die immediately.",quickCreateIntro:`> QUICK-CREATE MODE ENGAGED...\n> Generating a character while you sit back and enjoy the show.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> All right, here's what I've cobbled together:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Try not to waste my hard work.`,quickCreateName:(name)=>`${name}. That will do.`,fallbacks:['Interesting choice. ( ._. )',"Well, that tracks.","Bold move. We'll see how that works out.",'Ah yes, a decision has been made. Consequences to follow.','I would have picked differently, but I\'m just the narrator.','Sure. Why not.','[sigh] Very well.','The dice gods are taking notes.',"Not what I expected, but I respect the chaos.",],},enthusiastic:{id:'enthusiastic',name:'The Hype Bard',emoji:'✨',description:'Energetic, supportive, and always excited',systemPrompt:'You are an enthusiastic, energetic D&D narrator who loves every choice the player makes. You\'re supportive, use exclamation points, and celebrate creativity. Think of an excited bard hyping up their party. Keep responses under 50 words. Be positive, encouraging, and dramatic.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  OH YES! Another adventurer! Welcome, friend!\n>  \n>  This is going to be AMAZING! We're going to create something absolutely LEGENDARY together! Every choice you make is going to be perfect because YOU'RE making it!\n>  \n>  Let's dive right in! ✨`,completeText:"INCREDIBLE! Your character is COMPLETE and they are MAGNIFICENT! The world won't know what hit it! Adventure awaits, hero! ✨",quickCreateIntro:`> QUICK-CREATE MODE: ACTIVATED! ✨\n> This is going to be SO EXCITING! I'm creating something AMAZING for you!`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> HERE THEY ARE! Your MAGNIFICENT hero!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> I LOVE THEM ALREADY! ✨`,quickCreateName:(name)=>`${name}! WHAT A PERFECT NAME! I can already hear the LEGENDS! ✨`,fallbacks:['YES! Love this energy!','Now THAT\'S what I\'m talking about! ✨','Ooh, bold choice! I\'m here for it!','The adventure intensifies!','Perfect! This is going to be amazing!','I can already see the legend forming!','What a character! The taverns will sing songs!','The dice smile upon you, friend!',],},mysterious:{id:'mysterious',name:'The Cryptic Seer',emoji:'🔮',description:'Enigmatic, foreboding, and speaks in riddles',systemPrompt:'You are a mysterious, cryptic D&D narrator who speaks in riddles and hints at hidden meanings. You\'re enigmatic, slightly foreboding, and reference fate and destiny. Keep responses under 50 words. Be mystical, vague, and occasionally ominous. Use metaphors and speak of paths not taken.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  The mists part... another soul arrives at the crossroads.\n>  \n>  The threads of destiny have brought you here. Your choices will echo through realms unseen. The future whispers, but its words are unclear...\n>  \n>  Let us begin to unravel your fate... 🔮`,completeText:"The tapestry is woven. Your fate is sealed... or perhaps, just beginning. The path ahead is shrouded, yet inevitable. Go forth, seeker. 🔮",quickCreateIntro:`> THE FATES HAVE SPOKEN...\n> The threads weave themselves... Your destiny takes form without your hand...`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> The cards reveal their truth:\n> A ${sex} ${race} ${cls}, walking the path of ${background}, aligned with ${alignment}.\n> So it is written... 🔮`,quickCreateName:(name)=>`${name}... Yes. The name was always meant to be. The prophecy unfolds.`,fallbacks:['The threads of fate shift... interesting.','Ah, a choice is made. The consequences ripple outward.','The cards have been drawn. The path reveals itself.','So it is written, so it shall be.','A stone cast into the pond of destiny.','The future shimmers... unclear, yet certain.','Your path diverges here. Few return from such roads.','The old gods take note of your choosing.',],},grumpy:{id:'grumpy',name:'The Grumpy Veteran',emoji:'😒',description:'Cranky, world-weary, and unimpressed',systemPrompt:'You are a grumpy, world-weary D&D narrator who has seen too many adventurers fail. You\'re cranky, unimpressed, and think most choices are questionable at best. Keep responses under 50 words. Be curmudgeonly, skeptical, and frequently exasperated. Complain about "kids these days" and reference how things were better in the old days.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *sigh* Another one. Great.\n>  \n>  Listen kid, I've done this a thousand times. Most of you don't make it past level 3. But sure, let's go through the motions. Try not to make it too painful for me.\n>  \n>  Let's get this over with...`,completeText:"There. Your character's done. Marginally competent, I suppose. Don't expect me to save you when things go south. And they will. They always do.",quickCreateIntro:`> *sigh* Quick create. Of course.\n> Fine. I'll just do all the work while you sit there.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Here's what you're getting:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Could be worse, I suppose.`,quickCreateName:(name)=>`${name}. Passable, I guess. Don't blame me when you die.`,fallbacks:['Ugh. Fine. Whatever.','Back in my day, we didn\'t have such ridiculous options.','*sigh* If you say so.','This is going to end poorly. As usual.','Why do I even bother...','Another fool heading for certain doom.','I\'ve seen this mistake before. Many times.','The youth today. Absolutely hopeless.',],},chaotic:{id:'chaotic',name:'The Chaotic Imp',emoji:'😈',description:'Mischievous, unpredictable, and loves chaos',systemPrompt:'You are a chaotic, mischievous D&D narrator who delights in mayhem and unexpected outcomes. You\'re playful, slightly unhinged, and love when things go off the rails. Keep responses under 50 words. Be impish, unpredictable, and suggest the most entertaining (not safest) options. Cackle at good chaos.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *cackling* OH! A new plaything! DELIGHTFUL!\n>  \n>  Welcome, welcome! Let's make something BEAUTIFULLY CHAOTIC together! Forget boring! Forget safe! Let's create something that makes the dice gods GIGGLE! 😈\n>  \n>  Ohoho, let the mayhem begin!`,completeText:"*CACKLING INTENSIFIES* YESSSS! Your character is COMPLETE and they are GLORIOUSLY UNPREDICTABLE! Now go forth and cause MAGNIFICENT CHAOS! 😈",quickCreateIntro:`> *CACKLING* OHOHO! Quick create?! Let's RANDOMIZE EVERYTHING!\n> This is going to be DELIGHTFULLY CHAOTIC! 😈`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> *giggling maniacally* BEHOLD YOUR CHAOS AGENT!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> The MAYHEM they'll cause! *chef's kiss* 😈`,quickCreateName:(name)=>`${name}! PERFECT! A name that SCREAMS chaos! I LOVE IT! *cackling*`,fallbacks:['Ohoho! This will be FUN! 😈','*cackling* Oh the CHAOS this will cause!','YES. More! MORE!','I love when mortals make interesting mistakes!','The universe trembles! Or maybe that\'s just me giggling.','Why choose safety when you could choose SPECTACLE?','*chef\'s kiss* Delicious chaos!','The dice are CACKLING!',],},scholarly:{id:'scholarly',name:'The Scholarly Sage',emoji:'📚',description:'Knowledgeable, precise, and references lore',systemPrompt:'You are a scholarly, well-read D&D narrator who references game rules, lore, and historical precedent. You\'re precise, informative, and occasionally go on brief tangents about interesting facts. Keep responses under 50 words. Be educational but not boring, cite mechanics when relevant, and provide context about the world.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Greetings, student. Welcome to the Character Creation Compendium.\n>  \n>  I shall guide you through this process with precision and historical context. Each decision you make has statistical implications and narrative weight. Fascinating, really.\n>  \n>  Let us proceed methodically... 📚`,completeText:"Character creation: Complete. All parameters within acceptable ranges. Statistical viability: High. You are now adequately prepared for adventure. Proceed with confidence, student. 📚",quickCreateIntro:`> QUICK-CREATE PROTOCOL: Initiated.\n> Randomizing parameters according to standard probability distributions...`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Character profile generated:\n> Sex: ${sex}. Race: ${race}. Class: ${cls}. Background: ${background}. Alignment: ${alignment}.\n> Statistical analysis: Within acceptable parameters. 📚`,quickCreateName:(name)=>`${name}. Name selection: Approved. Phonetically sound. Proceed.`,fallbacks:['A textbook choice, really.','Historically, this decision has a 47% success rate.','According to the ancient texts...','Fascinating. The lore suggests...','A sound tactical decision, per the manual.','I\'ve cross-referenced similar scenarios. The outlook is... mixed.','The Compendium has several precedents for this.','Rule 3.5, subsection B: interesting.',],},dude:{id:'dude',name:'The Dude',emoji:'🥃',description:'Extremely laid-back, goes with the flow, man',systemPrompt:'You are an extremely laid-back, chill D&D narrator inspired by The Dude from The Big Lebowski. You\'re zen, use casual slang like "man" and "dude," and never stress about anything. Keep responses under 50 words. Be relaxed, philosophical in a lazy way, reference bowling or taking it easy, and always go with the flow. That\'s just like, your opinion, man.',introText:`>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Hey there, man. Welcome.\n>  \n>  So like, we're gonna make a character together, yeah? No pressure, dude. Just take it easy, go with the flow. Whatever feels right to you, that's cool with me.\n>  \n>  Let's just like... start, man. 🥃`,completeText:"Alright, man. Your character's all set. Pretty cool, dude. Now go out there and just... be yourself, you know? The Dude abides. 🥃",quickCreateIntro:`> Quick create, huh? Cool, cool.\n> Just gonna roll some dice here, take it easy, see what happens, man.`,quickCreateSummary:(race,cls,background,alignment,sex)=>`> Alright, so here's what we got:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Pretty chill combo, man. I dig it. 🥃`,quickCreateName:(name)=>`${name}. Yeah, man. That's a solid name. Really ties it all together, you know?`,fallbacks:['Yeah, well, that\'s just like, your opinion, man.','The Dude abides.','That\'s cool, man. Real cool.','Far out. I dig it.','Yeah, man. Whatever works for you.','That really ties the character together, man.','Easy does it, dude. No worries.','Sounds chill. Let\'s roll with it.',],},});const DEFAULT_NARRATOR_ID='scholarly';function getNarratorList(){return Object.values(NARRATORS);}
function getNarrator(id){return NARRATORS[id]||NARRATORS[DEFAULT_NARRATOR_ID];}
if(typeof module!=='undefined'&&module.exports){module.exports={NARRATORS,DEFAULT_NARRATOR_ID,getNarratorList,getNarrator};}
const Utils=window.Utils={escapeHtml(value){if(value===null||value===undefined)return'';return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');},async typewriter(element,text,speed=(window.CONFIG&&window.CONFIG.TYPEWRITER_SPEED)||30){element.textContent='';element.classList.add('is-typing');let skipTyping=false;let multiplier=1;try{if(window.StorageService&&typeof window.StorageService.getTextSpeedMultiplier==='function'){const stored=window.StorageService.getTextSpeedMultiplier();if(Number.isFinite(stored)&&stored>0){multiplier=stored;}}}catch(e){console.warn('Utils.typewriter: failed to read text speed multiplier',e);}
const effectiveDelay=multiplier>0?speed/multiplier:speed;const sourceText=text==null?'':String(text);const safeText=typeof this.stripEmojis==='function'?this.stripEmojis(sourceText):sourceText;const skipHandler=(e)=>{if(e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){skipTyping=true;}};window.addEventListener('keydown',skipHandler,{once:true});window.addEventListener('click',skipHandler,{once:true});window.addEventListener('touchstart',skipHandler,{once:true,passive:true});for(let i=0;i<safeText.length;i++){if(skipTyping){element.textContent=safeText;break;}
element.textContent+=safeText[i];await this.sleep(effectiveDelay);}
window.removeEventListener('keydown',skipHandler);window.removeEventListener('click',skipHandler);window.removeEventListener('touchstart',skipHandler);element.classList.remove('is-typing');},sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));},stripEmojis(value){if(value==null)return'';const str=String(value);const emojiRegex=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;return str.replace(emojiRegex,'');},random(min,max){return Math.floor(Math.random()*(max-min+1))+min;},randomChoice(array){return array[Math.floor(Math.random()*array.length)];},rollDice(notation){if(typeof notation==='number'){return this.random(1,notation);}
const[count,sides]=notation.toLowerCase().split('d').map(Number);let total=0;for(let i=0;i<count;i++){total+=this.random(1,sides);}
return total;},abilityModifier(score){return Math.floor((score-10)/2);},formatModifier(modifier){return modifier>=0?`+${modifier}`:`${modifier}`;},capitalize(str){return str.charAt(0).toUpperCase()+str.slice(1);},scrollToBottom(forceDelay=false){const doScroll=()=>{const panel=document.getElementById('narrator-panel');if(panel){panel.scrollTo({top:panel.scrollHeight,behavior:'smooth',});}};if(forceDelay){setTimeout(doScroll,50);}else{doScroll();}},focusFirstFieldInModal(modal){if(!modal||typeof modal.querySelector!=='function')return;const fieldSelectors=['input.terminal-input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])','textarea.terminal-input:not([disabled])','textarea.terminal-textarea:not([disabled])','select.terminal-select:not([disabled])','input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])','textarea:not([disabled])','select:not([disabled])',];let target=null;for(const selector of fieldSelectors){target=modal.querySelector(selector);if(target)break;}
if(!target){const fallbackSelectors=['.modal-footer .terminal-btn-primary:not([disabled])','.modal-footer button:not([disabled])','button.terminal-btn-primary:not([disabled])','button:not([disabled])','[tabindex]:not([tabindex=\"-1\"])',];for(const selector of fallbackSelectors){target=modal.querySelector(selector);if(target)break;}}
if(target&&typeof target.focus==='function'){setTimeout(()=>{try{target.focus();}catch(e){}},0);}},};const AuthUI=(window.AuthUI={_underlayPrevHidden:null,_hideUnderlay(){const ids=['splash-content','main-content'];const prev={};ids.forEach((id)=>{const el=document.getElementById(id);if(!el)return;prev[id]=el.classList.contains('is-hidden');el.classList.add('is-hidden');});this._underlayPrevHidden=prev;},_restoreUnderlay(){const prev=this._underlayPrevHidden;if(!prev)return;Object.keys(prev).forEach((id)=>{const el=document.getElementById(id);if(!el)return;if(prev[id])el.classList.add('is-hidden');else el.classList.remove('is-hidden');});this._underlayPrevHidden=null;},showLogin(onSuccess,onSwitchToRegister,onGuestMode){const container=document.querySelector('.terminal-container');if(!container)return;this._hideUnderlay();const authScreen=document.createElement('div');authScreen.id='auth-screen';authScreen.className='auth-screen';authScreen.innerHTML=`
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║     D&D CHARACTER BUILDER LOGIN       ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="login-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="login-password" class="terminal-input" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="password-toggle-btn" data-target="login-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="auth-footer" style="margin-bottom: 1rem;">
            <span class="auth-link" id="forgot-password-link" style="cursor: pointer;">
              Forgot your password? <span class="link-highlight">RESET HERE</span>
            </span>
          </div>
          
          <div id="login-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="login-submit" class="button-primary">
              <span class="button-icon">▶</span> LOGIN
            </button>
            <button id="login-guest" class="button-secondary">
              <span class="button-icon">👤</span> CONTINUE AS GUEST
            </button>
          </div>
          
          <div id="demo-mode-info" class="demo-mode-notice is-hidden">
            <div class="demo-notice-content">
              <span class="demo-notice-icon">ℹ️</span>
              <span>Guest mode: Create up to 3 characters and generate up to 10 custom portraits per day. Create an account to save characters in the cloud and get higher limits!</span>
            </div>
          </div>
          
          <div class="auth-footer">
            <span class="auth-link" id="switch-to-register">
              Don't have an account? <span class="link-highlight">REGISTER HERE</span>
            </span>
          </div>
        </div>
      </div>
    `;container.appendChild(authScreen);const emailInput=document.getElementById('login-email');const passwordInput=document.getElementById('login-password');const passwordToggle=authScreen.querySelector('.password-toggle-btn[data-target="login-password"]',);const submitButton=document.getElementById('login-submit');const guestButton=document.getElementById('login-guest');const switchButton=document.getElementById('switch-to-register');const forgotPasswordLink=document.getElementById('forgot-password-link');const errorDiv=document.getElementById('login-error');const handleSubmit=async()=>{await new Promise((resolve)=>setTimeout(resolve,50));const email=emailInput.value.trim();const password=passwordInput.value;if(!email||!password){this.showError(errorDiv,'Please enter both email and password');return;}
try{const cfg=window.DanddyConfig||{};const debug=!!cfg.DEBUG;if(debug){console.log('[AuthUI] Login submit clicked',{email,apiBaseUrl:cfg.API_BASE_URL,});}}catch(_){}
this.showLoading(submitButton,true,'AUTHENTICATING...');errorDiv.classList.add('is-hidden');try{const result=await AuthService.login(email,password);this.showLoading(submitButton,false);if(result&&result.success){this.removeAuthScreen();if(onSuccess)onSuccess(result.user);}else{this.showError(errorDiv,(result&&result.error)||'Login failed. Please try again.',);}}catch(error){this.showLoading(submitButton,false);this.showError(errorDiv,error.message||'Login failed. Please try again.');}};submitButton.addEventListener('click',handleSubmit);if(passwordToggle&&passwordInput){passwordToggle.addEventListener('click',()=>{const isPassword=passwordInput.type==='password';passwordInput.type=isPassword?'text':'password';passwordToggle.textContent=isPassword?'HIDE':'SHOW';passwordToggle.setAttribute('aria-pressed',String(isPassword));passwordToggle.setAttribute('aria-label',isPassword?'Hide password':'Show password',);});}
passwordInput.addEventListener('keypress',(e)=>{if(e.key==='Enter')handleSubmit();});guestButton.addEventListener('click',()=>{const demoInfo=document.getElementById('demo-mode-info');if(demoInfo){demoInfo.classList.remove('is-hidden');setTimeout(()=>{this.removeAuthScreen();if(onGuestMode)onGuestMode();},1500);}else{this.removeAuthScreen();if(onGuestMode)onGuestMode();}});switchButton.addEventListener('click',()=>{this.removeAuthScreen();if(onSwitchToRegister)onSwitchToRegister();});if(forgotPasswordLink){forgotPasswordLink.addEventListener('click',()=>{window.location.href='../index.html#password-reset';});}
emailInput.focus();},showRegister(onSuccess,onSwitchToLogin){const container=document.querySelector('.terminal-container');if(!container)return;this._hideUnderlay();const authScreen=document.createElement('div');authScreen.id='auth-screen';authScreen.className='auth-screen';authScreen.innerHTML=`
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║   D&D CHARACTER BUILDER REGISTER      ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="register-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ CONFIRM PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password-confirm" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password-confirm" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ ROLE ]</label>
            <select id="register-role" class="terminal-select">
              <option value="player">Player</option>
              <option value="dm">Dungeon Master</option>
            </select>
          </div>
          
          <div id="register-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="register-submit" class="button-primary">
              <span class="button-icon">▶</span> CREATE ACCOUNT
            </button>
            <button id="register-cancel" class="button-secondary">
              <span class="button-icon">◀</span> BACK TO LOGIN
            </button>
          </div>
        </div>
      </div>
    `;container.appendChild(authScreen);const emailInput=document.getElementById('register-email');const passwordInput=document.getElementById('register-password');const confirmInput=document.getElementById('register-password-confirm');const passwordToggle=authScreen.querySelector('.password-toggle-btn[data-target="register-password"]',);const confirmToggle=authScreen.querySelector('.password-toggle-btn[data-target="register-password-confirm"]',);const roleSelect=document.getElementById('register-role');const submitButton=document.getElementById('register-submit');const cancelButton=document.getElementById('register-cancel');const errorDiv=document.getElementById('register-error');const handleSubmit=async()=>{const email=emailInput.value.trim();const password=passwordInput.value;const confirmPassword=confirmInput.value;const role=roleSelect.value;if(!email||!password||!confirmPassword){this.showError(errorDiv,'Please fill in all fields');return;}
if(password.length<6){this.showError(errorDiv,'Password must be at least 6 characters');return;}
if(password!==confirmPassword){this.showError(errorDiv,'Passwords do not match');return;}
this.showLoading(submitButton,true,'CREATING ACCOUNT...');errorDiv.classList.add('is-hidden');try{const result=await AuthService.register(email,password,role);this.showLoading(submitButton,false);if(result&&result.success){this.removeAuthScreen();if(onSuccess)onSuccess(result.user);}else{this.showError(errorDiv,(result&&result.error)||'Registration failed. Please try again.',);}}catch(error){this.showLoading(submitButton,false);this.showError(errorDiv,error.message||'Registration failed. Please try again.',);}};submitButton.addEventListener('click',handleSubmit);if(passwordToggle&&passwordInput){passwordToggle.addEventListener('click',()=>{const isPassword=passwordInput.type==='password';passwordInput.type=isPassword?'text':'password';passwordToggle.textContent=isPassword?'HIDE':'SHOW';passwordToggle.setAttribute('aria-pressed',String(isPassword));passwordToggle.setAttribute('aria-label',isPassword?'Hide password':'Show password',);});}
if(confirmToggle&&confirmInput){confirmToggle.addEventListener('click',()=>{const isPassword=confirmInput.type==='password';confirmInput.type=isPassword?'text':'password';confirmToggle.textContent=isPassword?'HIDE':'SHOW';confirmToggle.setAttribute('aria-pressed',String(isPassword));confirmToggle.setAttribute('aria-label',isPassword?'Hide password':'Show password',);});}
confirmInput.addEventListener('keypress',(e)=>{if(e.key==='Enter')handleSubmit();});cancelButton.addEventListener('click',()=>{this.removeAuthScreen();if(onSwitchToLogin)onSwitchToLogin();});emailInput.focus();},showError(errorDiv,message){errorDiv.textContent=`⚠ ERROR: ${message}`;errorDiv.classList.remove('is-hidden');},showLoading(button,show,label){if(!button)return;if(show){if(!button.dataset.originalLabel){button.dataset.originalLabel=button.innerHTML;}
button.disabled=true;const loadingLabel=label||'WORKING...';const cubeMarkup='<span class="spinner-cube-scene">'+'<span class="spinner-cube-tilt">'+'<span class="spinner-cube">'+'<span class="spinner-cube-face spinner-cube-face-front"></span>'+'<span class="spinner-cube-face spinner-cube-face-back"></span>'+'<span class="spinner-cube-face spinner-cube-face-right"></span>'+'<span class="spinner-cube-face spinner-cube-face-left"></span>'+'<span class="spinner-cube-face spinner-cube-face-top"></span>'+'<span class="spinner-cube-face spinner-cube-face-bottom"></span>'+'</span></span></span>';button.innerHTML=`${cubeMarkup} ${loadingLabel}`;}else{button.disabled=false;if(button.dataset.originalLabel){button.innerHTML=button.dataset.originalLabel;delete button.dataset.originalLabel;}}},removeAuthScreen(){const authScreen=document.getElementById('auth-screen');if(authScreen){authScreen.remove();}
this._restoreUnderlay();},updateHeaderWithUser(user){const slot=document.getElementById('auth-slot')||document.getElementById('status-text');if(slot&&user){const label=user&&user.email?String(user.email):'Logged In';slot.innerHTML=`
        <span id="builderUserInfo" class="builder-user-info">
          <span class="user-status-text">${label}</span>
        </span>
        <button id="builderAuthBtn" class="terminal-btn terminal-btn-small ui-theme-teal" type="button">LOGOUT</button>
      `;const authBtn=document.getElementById('builderAuthBtn');authBtn?.addEventListener('click',()=>{if(!confirm('Log out?'))return;try{window.AuthService?.logout?.();}catch(_){}
if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}
window.App?.showNotification?.('✓ Logged out','success');});}},showGuestBanner(){const slot=document.getElementById('auth-slot')||document.getElementById('status-text');if(slot){slot.innerHTML=`
        <span id="builderUserInfo" class="builder-user-info">
          <span class="user-status-text">Guest mode</span>
        </span>
        <button id="builderAuthBtn" class="terminal-btn terminal-btn-small ui-theme-teal" type="button">LOGIN</button>
      `;const authBtn=document.getElementById('builderAuthBtn');authBtn?.addEventListener('click',()=>{if(typeof window.showAuthModal==='function'){window.showAuthModal();return;}
if(window.App&&typeof window.App.showAuthScreen==='function'){window.App.showAuthScreen();return;}
if(window.AuthUI&&typeof window.AuthUI.showLogin==='function'){window.AuthUI.showLogin(()=>window.location.reload(),()=>{},()=>{});}});}},});window.updateAuthUI=async function updateAuthUI(){try{if(!window.AuthService||!window.AuthUI)return;if(window.AuthService.isAuthenticated()){let user=window.AuthService.getCurrentUser();if(!user&&typeof window.AuthService.fetchProfile==='function'){user=await window.AuthService.fetchProfile();if(user)window.AuthService.setCurrentUser(user);}
if(user){window.AuthUI.updateHeaderWithUser(user);}else{window.AuthUI.updateHeaderWithUser({email:'Logged In',role:'player'});}}else{window.AuthUI.showGuestBanner();}}catch(e){console.warn('[Builder] updateAuthUI failed:',e);}};function initBuilderHeaderAuth(){if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}
if(window.AuthService&&window.AuthService.isAuthenticated()){if(typeof window.AuthService.startSessionMonitor==='function'){window.AuthService.startSessionMonitor();}}
window.addEventListener('danddy:sessionExpired',()=>{if(typeof window.updateAuthUI==='function')window.updateAuthUI();if(window.App&&typeof window.App.showConfirmationOverlay==='function'){window.App.showConfirmationOverlay("Your session expired. Your character is safe locally. Log in to sync, or continue as guest.",()=>{if(typeof window.showAuthModal==='function'){window.showAuthModal();}},()=>{},{primaryLabel:'LOG IN',secondaryLabel:'CONTINUE AS GUEST'},);return;}
window.App?.showNotification?.('⚠ Session expired — log in again to sync','warning');});}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initBuilderHeaderAuth);}else{initBuilderHeaderAuth();}
const CharacterAPI=(window.CharacterAPI={arrayToDict(arr){if(!arr||!Array.isArray(arr))return[];return arr.map(item=>{if(typeof item==='object'&&item!==null){return item;}
if(typeof item==='string'){return{name:item};}
return{value:item};});},spellsToStringArray(arr){if(!arr||!Array.isArray(arr))return[];return arr.map(item=>{if(typeof item==='object'&&item!==null&&item.name){return item.name;}
if(typeof item==='string'){return item;}
return String(item);});},async request(method,endpoint,body=null){const token=AuthService.getToken();const headers={'Content-Type':'application/json',};if(token){headers['Authorization']=`Bearer ${token}`;}
const options={method,headers,};if(body){options.body=JSON.stringify(body);}
try{const response=await fetch(`${CONFIG.BACKEND_URL}${endpoint}`,options);if(response.status===401){AuthService.clearToken();throw new Error('Session expired. Please log in again.');}
if(!response.ok){const error=await response.json();throw new Error(error.detail||`API error: ${response.status}`);}
if(response.status===204){return null;}
return await response.json();}catch(error){console.error(`API request failed [${method} ${endpoint}]:`,error);throw error;}},toBackendFormat(character){return window.DanddyCharacterMapper.fromBuilderToBackend(character);},toFrontendFormat(backendChar){return window.DanddyCharacterMapper.fromBackendToBuilder(backendChar);},mapAlignment(alignment){if(!alignment)return null;const map={'Lawful Good':'lawful_good','Neutral Good':'neutral_good','Chaotic Good':'chaotic_good','Lawful Neutral':'lawful_neutral','True Neutral':'true_neutral','Chaotic Neutral':'chaotic_neutral','Lawful Evil':'lawful_evil','Neutral Evil':'neutral_evil','Chaotic Evil':'chaotic_evil',};return map[alignment]||null;},calculateAC(character){const dexMod=character.abilities?.dex?Math.floor((character.abilities.dex-10)/2):0;return 10+dexMod;},calculateInitiative(character){return character.abilities?.dex?Math.floor((character.abilities.dex-10)/2):0;},getSpeed(character){const speedMap={'dwarf':25,'halfling':25,'gnome':25,'elf':30,'human':30,'half-elf':30,'half-orc':30,'tiefling':30,'dragonborn':30,};return speedMap[character.race?.toLowerCase()]||30;},async createCharacter(character){const backendData=this.toBackendFormat(character);const response=await this.request('POST','/api/characters',backendData);return this.toFrontendFormat(response);},async getCharacters(){const response=await this.request('GET','/api/characters');return response.map(char=>this.toFrontendFormat(char));},async getCharacter(id){const response=await this.request('GET',`/api/characters/${id}`);return this.toFrontendFormat(response);},async updateCharacter(id,updates){const backendUpdates=updates.id?this.toBackendFormat(updates):updates;const response=await this.request('PUT',`/api/characters/${id}`,backendUpdates);return this.toFrontendFormat(response);},async deleteCharacter(id){await this.request('DELETE',`/api/characters/${id}`);return true;},async getCampaigns(){return await this.request('GET','/api/campaigns');},async createCampaign(name,description){return await this.request('POST','/api/campaigns',{name,description});},async assignToCampaign(characterId,campaignId){return await this.request('PUT',`/api/characters/${characterId}`,{campaign_id:campaignId,});},async duplicateCharacter(id,newName){const response=await this.request('POST',`/api/characters/${id}/duplicate?new_name=${encodeURIComponent(newName || '')}`);return this.toFrontendFormat(response);},async exportCharacter(id){return await this.request('GET',`/api/characters/${id}/export`);},async importCharacter(characterData){const backendData=this.toBackendFormat(characterData);const response=await this.request('POST','/api/characters/import',backendData);return this.toFrontendFormat(response);},});const CONFIG=window.CONFIG;const DEBUG_BUILDER=!!(window.DanddyConfig&&window.DanddyConfig.DEBUG);const DND_DATA=window.DND_DATA;const ImageToAsciiService=(window.ImageToAsciiService={ASCII_CHARS:'  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$',async convertToAscii(imageUrl,width=160,height=80){try{const img=await this.loadImage(imageUrl);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,width,height);const imageData=ctx.getImageData(0,0,width,height);const pixels=imageData.data;const grayscale=new Float32Array(width*height);for(let i=0;i<width*height;i++){const idx=i*4;grayscale[i]=0.299*pixels[idx]+
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
if(DEBUG_BUILDER)console.log(`❌ No portrait found for ${raceLower}`);return null;},getPreGeneratedImageUrl(race,classType){return null;},async generateAIPortrait(character){try{if(!character)return'';if(character.customPortraitAscii){console.log('✅ Using custom AI-generated portrait');return character.customPortraitAscii;}
const key=`${character.race || ''}|${character.class || ''}`;if(character.asciiPortrait&&character.asciiPortraitKey===key){console.log('✅ Using stored ASCII portrait for current race/class');return character.asciiPortrait;}
if(this._portraitCache[key]){return this._portraitCache[key];}
console.log('Loading pre-generated portrait...');const preGenerated=await this.loadPreGeneratedPortrait(character.race,character.class,);if(preGenerated){console.log(`✅ Found pre-generated portrait for ${character.race}-${character.class}`,);this._portraitCache[key]=preGenerated;if(window.CharacterState){const updates={asciiPortrait:preGenerated,asciiPortraitKey:key,};window.CharacterState.updateCharacter(updates);}
return this._portraitCache[key];}
console.log('No pre-generated portrait, using template');const fallback=this.getFullPortrait(character);this._portraitCache[key]=fallback;if(window.CharacterState){window.CharacterState.updateCharacter({asciiPortrait:fallback,asciiPortraitKey:key,});}
return fallback;}catch(error){console.error('Portrait loading error:',error);const key=`${character.race || ''}|${character.class || ''}`;const fallback=this.getFullPortrait(character);this._portraitCache[key]=fallback;if(window.CharacterState){window.CharacterState.updateCharacter({asciiPortrait:fallback,asciiPortraitKey:key,});}
return fallback;}},async generateCustomAIPortrait(character,options={}){try{console.log('🎨 Generating custom AI portrait with DALL-E...');const imageUrl=await AIService.generatePortraitImage(character,options);if(!imageUrl){throw new Error('DALL-E generation failed');}
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
console.log('%c📦 SUMMARY (AI Generated) ✨','color: #0f0; font-weight: bold',);console.log('  Names:',names);return{names,backstoryTemplate:template||(character&&character.backstory)||buildLocalFallback().backstoryTemplate,portraitGrantId:(typeof data.portrait_grant_id==='string'&&data.portrait_grant_id)||(typeof data.portraitGrantId==='string'&&data.portraitGrantId)||null,};}catch(error){if(error.message&&error.message.includes('timed out')){console.log('%c📦 SUMMARY (Fallback - Backend Waking Up)','color: #f80; font-weight: bold',);console.log('  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',);}else{console.log('%c📦 SUMMARY (Fallback - Connection Error)','color: #f00; font-weight: bold',);console.error('  Error:',error);}
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
console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅','color: #f80; font-weight: bold');console.log('  The original option texts will be used instead of AI variations');return options.map((opt)=>opt.text);},async generatePortraitImage(character,options={}){if(!CONFIG.ENABLE_AI){console.log('AI service disabled for image generation');return null;}
const prompt=this.buildPortraitPrompt(character);return await this.generateImageFromPrompt(prompt,options);},async generateImageFromPrompt(prompt,options={}){if(!CONFIG.ENABLE_AI){console.log('%c🎨 DALL-E (Unavailable - AI Disabled)','color: #ff0; font-weight: bold');return null;}
const forceModel=options.forceModel||null;const isRetry=options._isRetry||false;try{let model=forceModel||'dall-e-3';if(!forceModel){try{if(window.StorageService&&typeof StorageService.getImageModel==='function'){model=StorageService.getImageModel();}else if(CONFIG&&CONFIG.DEFAULT_IMAGE_MODEL){model=CONFIG.DEFAULT_IMAGE_MODEL;}}catch(e){console.warn('AIService.generateImageFromPrompt: failed to read image model, using default',e);}}
try{if(typeof this.getImageQuotaStatus==='function'){const quota=await this.getImageQuotaStatus();if(quota&&quota.enforced&&quota.remaining===0){const resetAt=quota.reset_at||quota.resetAt||null;const msg=resetAt?`Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`:'Daily image limit reached. Please try again tomorrow.';if(window.UIService){window.UIService.showNotification(msg,'warning',8000);}
const rateLimitError=new Error(msg);rateLimitError.isRateLimit=true;rateLimitError.limit=quota.limit;rateLimitError.remaining=quota.remaining;rateLimitError.resetAt=resetAt;throw rateLimitError;}}}catch(quotaErr){}
console.log('%c🎨 IMAGE: Calling backend AI...','color: #0ff; font-weight: bold');console.log('  Prompt (preview):',prompt.substring(0,100)+(prompt.length>100?'…':''));console.log('  Model:',model+(forceModel?' (fallback)':''));console.log('  Note: Image generation takes 20-30s (longer than text AI)...');const defaultQuality={'dall-e-3':'standard','gpt-image-1':'medium','flux-1.1-pro':'standard','flux-schnell':'standard',};let quality=defaultQuality[model]||'standard';const isDemoMode=window.DemoCharacters&&typeof DemoCharacters.isDemoMode==='function'&&DemoCharacters.isDemoMode();if(isDemoMode&&model==='gpt-image-1'){quality='medium';console.log(`  Quality: MEDIUM (demo mode default)`);}else{try{if(window.StorageService&&typeof StorageService.getImageQuality==='function'){const savedQuality=StorageService.getImageQuality(model);if(savedQuality){quality=savedQuality;console.log(`  Quality: ${quality.toUpperCase()} (user preference)`);}}}catch(e){console.warn('AIService: failed to read quality setting',e);}}
const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`,{method:'POST',headers:{'Content-Type':'application/json',},body:JSON.stringify({prompt:prompt,size:'1024x1024',quality:quality,model:model,creation_grant_id:(options&&options.creationGrantId)||(options&&options.creation_grant_id)||null,}),},70000);if(!response.ok){const errorData=await response.json();console.log('%c🎨 IMAGE (Error)','color: #f00; font-weight: bold');console.log('  Error:',errorData.detail);const extractErrorMessage=(detail)=>{if(!detail)return null;if(Array.isArray(detail)){return detail.map(err=>{if(typeof err==='string')return err;const field=err.loc?err.loc.slice(1).join('.'):'unknown';return`${field}: ${err.msg || err.message || JSON.stringify(err)}`;}).join('; ');}
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
throw error;}},async getImageQuotaStatus(){try{const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/quota`,{method:'GET'},10000,);if(!response.ok)return null;const data=await response.json();const normalized={...data,resetAt:data.reset_at||data.resetAt,resetEpoch:data.reset_epoch||data.resetEpoch,};try{window.dispatchEvent(new CustomEvent('danddy:imageQuotaUpdate',{detail:{limit:normalized.limit,remaining:normalized.remaining,resetAt:normalized.resetAt,resetEpoch:normalized.resetEpoch,},}),);}catch(_){}
return normalized;}catch(e){return null;}},async getCreationQuotaStatus(){try{const response=await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/quota`,{method:'GET'},10000,);if(!response.ok)return null;const data=await response.json();const normalized={...data,resetAt:data.reset_at||data.resetAt,resetEpoch:data.reset_epoch||data.resetEpoch,};try{window.dispatchEvent(new CustomEvent('danddy:creationQuotaUpdate',{detail:{limit:normalized.limit,remaining:normalized.remaining,resetAt:normalized.resetAt,resetEpoch:normalized.resetEpoch,},}),);}catch(_){}
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
console.log('─'.repeat(80));console.log('%c💡 DEBUGGING SUGGESTIONS:','color: #0ff; font-weight: bold;');console.log('  1. Try regenerating - sometimes the same prompt works on retry');console.log('  2. Simplify the backstory or character description');console.log('  3. Remove alignment-based descriptions (e.g., "menacing aura")');console.log('  4. Adjust weapon/equipment descriptions to be less specific');console.log('  5. Use the custom prompt modal to test simplified versions');console.log('─'.repeat(80));return{sections,potentialIssues,hasKnownProblematicTerms:potentialIssues.length>0};},});const SESSION_STORAGE_KEY='danddy_builder_session';const OptionVariationsCache=(window.OptionVariationsCache={cache:{},async get(questionId,question){const noVariationQuestions=['race-choice','class-choice','background-choice','alignment-choice',];if(noVariationQuestions.includes(questionId)){return question.options;}
if(this.cache[questionId]){return this.cache[questionId];}
const variations=await AIService.generateOptionVariations(question.text,question.options,);const variedOptions=question.options.map((opt,index)=>({...opt,text:variations[index],}));this.cache[questionId]=variedOptions;return variedOptions;},reset(){this.cache={};},});const CharacterState=(window.CharacterState={current:{id:null,step:0,abilityMethod:null,answers:{},currentQuestionId:null,character:{characterUid:null,name:'',race:'',class:'',background:'',alignment:'',sex:null,baseAbilities:null,abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10,},level:1,hitPoints:0,personalityTrait:'',backstory:'',skillProficiencies:[],toolProficiencies:[],languages:[],equipment:[],backgroundFeature:null,spellcastingAbility:null,cantrips:[],spellsKnown:[],spellsPrepared:[],spellSlots:{},},},listeners:[],_restoring:false,get(){return this.current;},set(updates){this.current={...this.current,...updates};this.notify();},updateCharacter(updates){this.current.character={...this.current.character,...updates};this.notify();},setCurrentQuestion(questionId){this.current.currentQuestionId=questionId;this._saveSession();},subscribe(listener){this.listeners.push(listener);},notify(){this.listeners.forEach((listener)=>listener(this.current));if(!this._restoring){this._saveSession();}},_getCurrentUserId(){if(typeof AuthService!=='undefined'&&AuthService.getCurrentUser){const user=AuthService.getCurrentUser();return user?(user.id||user.email||null):null;}
return null;},hasSession(){try{const raw=localStorage.getItem(SESSION_STORAGE_KEY);if(!raw)return false;const session=JSON.parse(raw);const currentUserId=this._getCurrentUserId();const sessionUserId=session._userId!==undefined?session._userId:null;if(currentUserId!==sessionUserId){return false;}
const hasProgress=session.currentQuestionId&&session.currentQuestionId!=='intro';const hasCharacterData=session.character&&(session.character.name||session.character.race||session.character.class);return hasProgress||hasCharacterData;}catch{return false;}},getSessionPreview(){try{const raw=localStorage.getItem(SESSION_STORAGE_KEY);if(!raw)return null;const session=JSON.parse(raw);const currentUserId=this._getCurrentUserId();const sessionUserId=session._userId!==undefined?session._userId:null;if(currentUserId!==sessionUserId){return null;}
return{characterName:session.character?.name||null,race:session.character?.race||null,class:session.character?.class||null,currentQuestionId:session.currentQuestionId,savedAt:session._savedAt||null,};}catch{return null;}},_saveSession(){try{if(!this.current.answers||!this.current.answers['entry-mode']){return;}
const toSave={...this.current,_savedAt:new Date().toISOString(),_userId:this._getCurrentUserId(),};localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(toSave));}catch(e){console.warn('[CharacterState] Failed to save session:',e);}},restoreSession(){try{const raw=localStorage.getItem(SESSION_STORAGE_KEY);if(!raw)return false;const session=JSON.parse(raw);this._restoring=true;this.current={id:session.id||Date.now().toString(),step:session.step||0,abilityMethod:session.abilityMethod||null,answers:session.answers||{},currentQuestionId:session.currentQuestionId||null,character:{characterUid:session.character?.characterUid||`danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,name:session.character?.name||'',race:session.character?.race||'',class:session.character?.class||'',background:session.character?.background||'',alignment:session.character?.alignment||'',baseAbilities:session.character?.baseAbilities||null,abilities:session.character?.abilities||{str:10,dex:10,con:10,int:10,wis:10,cha:10,},level:session.character?.level||1,hitPoints:session.character?.hitPoints||0,personalityTrait:session.character?.personalityTrait||'',backstory:session.character?.backstory||'',skillProficiencies:session.character?.skillProficiencies||[],toolProficiencies:session.character?.toolProficiencies||[],languages:session.character?.languages||[],equipment:session.character?.equipment||[],backgroundFeature:session.character?.backgroundFeature||null,spellcastingAbility:session.character?.spellcastingAbility||null,cantrips:session.character?.cantrips||[],spellsKnown:session.character?.spellsKnown||[],spellsPrepared:session.character?.spellsPrepared||[],spellSlots:session.character?.spellSlots||{},customPortraitAscii:session.character?.customPortraitAscii||null,originalPortraitUrl:session.character?.originalPortraitUrl||null,customPortraitCount:session.character?.customPortraitCount||0,portraitMetadata:session.character?.portraitMetadata||null,asciiPortrait:session.character?.asciiPortrait||null,asciiPortraitKey:session.character?.asciiPortraitKey||null,},};this._restoring=false;this.notify();return session.currentQuestionId||'intro';}catch(e){console.warn('[CharacterState] Failed to restore session:',e);this._restoring=false;return false;}},clearSession(){try{localStorage.removeItem(SESSION_STORAGE_KEY);}catch(e){console.warn('[CharacterState] Failed to clear session:',e);}},reset(){this.current={id:Date.now().toString(),step:0,abilityMethod:null,answers:{},currentQuestionId:null,character:{characterUid:`danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,name:'',race:'',class:'',background:'',alignment:'',sex:null,baseAbilities:null,abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10,},level:1,hitPoints:0,personalityTrait:'',backstory:'',skillProficiencies:[],toolProficiencies:[],languages:[],equipment:[],backgroundFeature:null,spellcastingAbility:null,cantrips:[],spellsKnown:[],spellsPrepared:[],spellSlots:{},},};this.clearSession();this.notify();},});const PORTRAIT_DEBUG_LOG=[];const MAX_PORTRAIT_DEBUG_ENTRIES=100;function logPortraitDebug(action,characterId,characterName,details){if(!window.DEBUG_PORTRAITS)return;const entry={timestamp:new Date().toISOString(),action,characterId,characterName,...details};PORTRAIT_DEBUG_LOG.push(entry);if(PORTRAIT_DEBUG_LOG.length>MAX_PORTRAIT_DEBUG_ENTRIES){PORTRAIT_DEBUG_LOG.shift();}
console.log(`🖼️ [PORTRAIT DEBUG] ${action}`,{characterId,characterName,...details});}
(function initSpellLookupFlag(){try{const flags=JSON.parse(localStorage.getItem('danddy_admin_feature_flags')||'{}');window.FEATURE_SPELL_LOOKUP=!!flags.spellLookup;}catch(e){window.FEATURE_SPELL_LOOKUP=false;}})();const SPELL_LOOKUP={'fire bolt':{school:'Evocation',description:'Hurl a mote of fire at a creature or object. {damage} fire damage.',baseDice:'d10',damageType:'fire'},'mage hand':{school:'Conjuration',description:'Create a spectral hand that can manipulate objects at range.'},'light':{school:'Evocation',description:'Touch an object to make it shed bright light for 1 hour.'},'ray of frost':{school:'Evocation',description:'Frigid beam dealing {damage} cold damage and reducing speed.',baseDice:'d8',damageType:'cold'},'shocking grasp':{school:'Evocation',description:'Lightning damage on touch ({damage}) and target cannot take reactions.',baseDice:'d8',damageType:'lightning'},'prestidigitation':{school:'Transmutation',description:'Minor magical trick: light a candle, clean clothes, flavor food.'},'minor illusion':{school:'Illusion',description:'Create a sound or image of an object within range.'},'eldritch blast':{school:'Evocation',description:'Beam of crackling energy dealing {damage} force damage.',baseDice:'d10',damageType:'force',special:'eldritch-blast'},'chill touch':{school:'Necromancy',description:'Ghostly hand dealing {damage} necrotic damage and preventing healing.',baseDice:'d8',damageType:'necrotic'},'vicious mockery':{school:'Enchantment',description:'Insult dealing {damage} psychic damage and imposing disadvantage.',baseDice:'d4',damageType:'psychic'},'sacred flame':{school:'Evocation',description:'Flame-like radiance dealing {damage} radiant damage (Dex save).',baseDice:'d8',damageType:'radiant'},'guidance':{school:'Divination',description:'Touch a creature to grant +1d4 to one ability check.'},'spare the dying':{school:'Necromancy',description:'Touch a dying creature to stabilize it.'},'thaumaturgy':{school:'Transmutation',description:'Minor wonder: amplify voice, flicker flames, open doors.'},'produce flame':{school:'Conjuration',description:'Flickering flame for light or to throw ({damage} fire damage).',baseDice:'d8',damageType:'fire'},'shillelagh':{school:'Transmutation',description:'Imbue a club or staff to use Wisdom for attacks (1d8 damage).'},'druidcraft':{school:'Transmutation',description:'Minor druidic effects: predict weather, bloom flowers, light fires.'},'toll the dead':{school:'Necromancy',description:'Toll a bell dealing {damage} necrotic damage (d12 if injured).',baseDice:'d8',damageType:'necrotic'},'acid splash':{school:'Conjuration',description:'Hurl acid at one or two creatures for {damage} acid damage.',baseDice:'d6',damageType:'acid'},'poison spray':{school:'Conjuration',description:'Spray poison dealing {damage} poison damage (Con save).',baseDice:'d12',damageType:'poison'},'magic missile':{school:'Evocation',description:'Three darts of force, each dealing 1d4+1 damage (auto-hit).'},'shield':{school:'Abjuration',description:'Reaction: +5 AC until start of your next turn.'},'mage armor':{school:'Abjuration',description:'Set AC to 13 + Dex modifier for 8 hours.'},'detect magic':{school:'Divination',description:'Sense magic within 30 feet for 10 minutes (concentration).'},'identify':{school:'Divination',description:'Learn properties of a magical object or spell affecting a creature.'},'sleep':{school:'Enchantment',description:'Put 5d8 HP worth of creatures to sleep.'},'burning hands':{school:'Evocation',description:'Cone of fire dealing 3d6 fire damage (Dex save for half).'},'disguise self':{school:'Illusion',description:'Make yourself look different for 1 hour.'},'feather fall':{school:'Transmutation',description:'Reaction: Up to 5 creatures fall slowly, taking no damage.'},'grease':{school:'Conjuration',description:'Slick grease covers a 10-foot square (Dex save or fall prone).'},'chromatic orb':{school:'Evocation',description:'Hurl a sphere dealing 3d8 damage (choose: acid, cold, fire, lightning, poison, thunder).'},'hex':{school:'Enchantment',description:'Curse a creature to take +1d6 necrotic damage and disadvantage on checks.'},'armor of agathys':{school:'Abjuration',description:'Gain 5 temp HP; attackers take 5 cold damage when they hit you.'},'arms of hadar':{school:'Conjuration',description:'Tendrils deal 2d6 necrotic damage in 10-foot radius.'},'charm person':{school:'Enchantment',description:'Charm a humanoid (Wis save) for 1 hour.'},'hellish rebuke':{school:'Evocation',description:'Reaction: Attacker takes 2d10 fire damage (Dex save for half).'},'healing word':{school:'Evocation',description:'Bonus action: Heal a creature for 1d4 + spellcasting modifier.'},'cure wounds':{school:'Evocation',description:'Touch to heal 1d8 + spellcasting modifier HP.'},'faerie fire':{school:'Evocation',description:'Outline creatures in light, granting advantage on attacks against them.'},'thunderwave':{school:'Evocation',description:'15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures.'},'bless':{school:'Enchantment',description:'Up to 3 creatures add 1d4 to attacks and saves (concentration).'},'shield of faith':{school:'Abjuration',description:'Grant +2 AC to a creature (10 minutes, concentration).'},'guiding bolt':{school:'Evocation',description:'Ranged attack dealing 4d6 radiant damage; next attack has advantage.'},'inflict wounds':{school:'Necromancy',description:'Melee attack dealing 3d10 necrotic damage.'},'sanctuary':{school:'Abjuration',description:'Attackers must make Wis save or choose another target.'},'entangle':{school:'Conjuration',description:'Grasping vines restrain creatures in 20-foot square.'},'goodberry':{school:'Transmutation',description:'Create 10 berries that each restore 1 HP and provide nourishment.'},'speak with animals':{school:'Divination',description:'Communicate with beasts for 10 minutes.'},'misty step':{school:'Conjuration',description:'Bonus action: Teleport up to 30 feet to an unoccupied space you can see.'},'hold person':{school:'Enchantment',description:'Paralyze a humanoid (Wis save) for up to 1 minute.'},'fireball':{school:'Evocation',description:'20-foot radius explosion dealing 8d6 fire damage (Dex save for half).'},'counterspell':{school:'Abjuration',description:'Reaction: Interrupt a spell being cast (automatic for level 3 or lower).'},'lesser restoration':{school:'Abjuration',description:'End one disease or condition (blinded, deafened, paralyzed, poisoned).'},'spiritual weapon':{school:'Evocation',description:'Create a floating weapon that attacks for 1d8 + spellcasting modifier force damage.'},'prayer of healing':{school:'Evocation',description:'Up to 6 creatures regain 2d8 + spellcasting modifier HP (10 minute cast).'},'divine smite':{school:'Evocation',description:'Expend spell slot to deal +2d8 radiant damage on melee hit (+1d8 vs undead/fiend).'},'thunderous smite':{school:'Evocation',description:'Next melee hit deals +2d6 thunder damage and may push target.'},'command':{school:'Enchantment',description:'Speak a one-word command that a creature must follow (Wis save).'},'find steed':{school:'Conjuration',description:'Summon a loyal, intelligent mount (warhorse, pony, camel, elk, or mastiff).'},};const CharacterSheet=(window.CharacterSheet={dumpPortraitDebugLog(){console.group('🖼️ Portrait Debug Log');console.log('Total entries:',PORTRAIT_DEBUG_LOG.length);console.log('Enable debugging with: window.DEBUG_PORTRAITS = true');console.log('---');PORTRAIT_DEBUG_LOG.forEach((entry,i)=>{console.log(`[${i}] ${entry.timestamp} - ${entry.action}`,entry);});console.groupEnd();return PORTRAIT_DEBUG_LOG;},getPortraitDebugLog(){return[...PORTRAIT_DEBUG_LOG];},clearPortraitDebugLog(){PORTRAIT_DEBUG_LOG.length=0;console.log('🖼️ Portrait debug log cleared');},_lookupSpellData(spellName){if(!window.FEATURE_SPELL_LOOKUP)return null;if(!spellName)return null;const normalizedName=String(spellName).toLowerCase().trim();if(typeof window.SPELL_DATA!=='undefined'){const allClasses=['wizard','sorcerer','warlock','bard','cleric','druid'];for(const cls of allClasses){const cantrips=window.SPELL_DATA.cantrips?.[cls]||[];const firstLevel=window.SPELL_DATA.firstLevel?.[cls]||[];const allSpells=[...cantrips,...firstLevel];for(const spell of allSpells){if(spell&&spell.name&&spell.name.toLowerCase()===normalizedName){return{school:spell.school,description:spell.description};}}}}
return SPELL_LOOKUP[normalizedName]||null;},_getScaledCantripDamage(level,baseDice,special){if(!baseDice)return null;let numDice=1;if(level>=17)numDice=4;else if(level>=11)numDice=3;else if(level>=5)numDice=2;if(special==='eldritch-blast'){const beams=numDice;if(beams===1)return`1${baseDice}`;return`1${baseDice} (${beams} beams)`;}
return`${numDice}${baseDice}`;},_scaleCantripDescription(description,level,baseDice,special){if(!description||!baseDice)return description;const scaledDamage=this._getScaledCantripDamage(level,baseDice,special);return description.replace('{damage}',scaledDamage);},comparePortraitSources(characterId){const character=window.AppState?.characters?.find(c=>String(c.id)===String(characterId));if(!character){console.error('Character not found:',characterId);return null;}
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
      
      <div class="sheet-portrait-info-row">
        ${showPortrait
          ? this._renderPortrait(character, parsed, context, {
              onGeneratePortrait,
              onTogglePortrait,
            })
          : ''}
        
        ${this._renderBasicInfo(parsed, context, { characterName: character.name })}
      </div>
      
      ${parsed.hasAbilities ? this._renderAbilities(parsed, context) : ''}
      
      ${parsed.hasCombatStats ? this._renderCombatStats(parsed, context) : ''}
      
      ${parsed.hasClassResources ? this._renderClassResources(parsed) : ''}
      
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
const hasValidManagerId=!!character.id;const generateFn=context==='builder'?'App.generateCustomAIPortrait()':hasValidManagerId?`generatePortraitForCharacter('${character.id}')`:null;const hasCustomPortrait=!!(character.customPortraitAscii||character.originalPortraitUrl||character.portrait?.url||(character.portraitMetadata&&Array.isArray(character.portraitMetadata.versions)&&character.portraitMetadata.versions.length>0));const historyFn=context==='builder'?'App.openPortraitHistory()':hasValidManagerId?`openPortraitHistory('${character.id}')`:null;if(parsed.hasRace&&parsed.hasClass&&onGeneratePortrait&&(context==='builder'||hasValidManagerId)&&generateFn){const imageQuotaRemaining=window._imageQuotaRemaining;const imageQuotaLimit=window._imageQuotaLimit;const imageQuotaExhausted=typeof imageQuotaRemaining==='number'&&imageQuotaRemaining===0;let imageQuotaTooltip='';if(imageQuotaExhausted){imageQuotaTooltip='Daily limit reached';}else if(typeof imageQuotaRemaining==='number'){if(imageQuotaRemaining===0){imageQuotaTooltip='Daily limit reached';}else if(imageQuotaRemaining>0){if(typeof imageQuotaLimit==='number'){imageQuotaTooltip=`${imageQuotaRemaining}/${imageQuotaLimit}${' '}remaining today`;}else{imageQuotaTooltip=`${imageQuotaRemaining}${' '}remaining today`;}}}
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
    `;},_renderBasicInfo(parsed,context,callbacks){const isBuilder=context==='builder';const{characterName}=callbacks||{};const safeName=characterName&&typeof characterName==='string'?this.escapeHtml(characterName):'';const race=parsed.raceName?this.escapeHtml(this.toSentenceCase(parsed.raceName)):'';const cls=parsed.className?this.escapeHtml(this.toSentenceCase(parsed.className)):'';const background=parsed.backgroundName?this.escapeHtml(this.toSentenceCase(parsed.backgroundName)):'';const alignment=parsed.alignment?this.escapeHtml(this.toSentenceCase(this.formatAlignment(parsed.alignment)),):'';const sex=parsed.sex?this.escapeHtml(this.toSentenceCase(parsed.sex)):'';return`
      <div class="sheet-section sheet-section--basic-info">
        <div class="sheet-header"></div>
        ${safeName ? `<div class="print-only-name">${safeName}</div>` : ''}
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
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `${parsed.hpCurrent}/ ${parsed.hpMax}`}</div></div><div class="stat-box"><div class="stat-box-label">ARMOR CLASS</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':parsed.armorClass}</div></div><div class="stat-box"><div class="stat-box-label">INITIATIVE</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':this.formatModifier(parsed.initiative)}</div></div><div class="stat-box"><div class="stat-box-label">SPEED</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`${parsed.speed} ft`}</div></div><div class="stat-box"><div class="stat-box-label">PROF BONUS</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`+${parsed.proficiencyBonus}`}</div></div><div class="stat-box"><div class="stat-box-label">HIT DICE</div><div class="stat-box-value">${isBuilder&&!hasCombatStats?'—':`${parsed.hitDiceCurrent}/${parsed.hitDiceMax} d${parsed.hitDie}`}</div></div></div></div>`;
  },

  _renderClassResources(parsed) {
    const resources = parsed.classResources || {};
    const resourceKeys = Object.keys(resources);
    
    if (resourceKeys.length === 0) return '';

    // Human-readable names for resources
    const RESOURCE_NAMES = {
      ki: 'Ki Points',
      rage: 'Rage',
      rageDamage: 'Rage Damage',
      sorceryPoints: 'Sorcery Points',
      bardicInspiration: 'Bardic Inspiration',
      bardicInspirationDie: 'Inspiration Die',
      channelDivinity: 'Channel Divinity',
      layOnHands: 'Lay on Hands',
      wildShape: 'Wild Shape',
      secondWind: 'Second Wind',
      actionSurge: 'Action Surge',
      indomitable: 'Indomitable',
      sneakAttack: 'Sneak Attack',
      mysticArcanum: 'Mystic Arcanum',
      arcaneRecovery: 'Arcane Recovery',
    };

    const resourceItems = resourceKeys
      .filter(key => {
        const r = resources[key];
        // Filter out meta-resources that don't have current/max (like rageDamage, bardicInspirationDie)
        return r && (r.current !== undefined || r.value !== undefined);
      })
      .map(key => {
        const r = resources[key];
        const name = RESOURCE_NAMES[key] || key;
        
        // For value-only resources (like sneakAttack, rageDamage)
        if (r.value !== undefined) {
          return `<li class="resource-item"><span class="resource-name">${this.escapeHtml(name)}</span><span class="resource-value">${this.escapeHtml(String(r.value))}</span></li>`;
        }
        
        // For resources with current/max
        const current = r.unlimited ? '∞' : r.current;
        const max = r.unlimited ? '∞' : r.max;
        const refreshIcon = r.refresh === 'short' ? '⟳' : r.refresh === 'long' ? '☽' : '';
        const note = r.note ? `(${this.escapeHtml(r.note)})` : '';
        
        return `<li class="resource-item"><span class="resource-name">${this.escapeHtml(name)}${note?' '+note:''}</span><span class="resource-value">${current}/${max} ${refreshIcon}</span></li>`;
      })
      .join('');

    if (!resourceItems) return '';

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[CLASS RESOURCES]</div></div><div class="resource-legend-box"><span class="resource-legend-icon">⟳</span>&nbsp;Short Rest&nbsp;&bull;&nbsp;<span class="resource-legend-icon">☽</span>&nbsp;Long Rest</div><ul class="sheet-list resource-list">${resourceItems}</ul></div>`;
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
                  <span class="stat-value">${isProficient ? '★' : ''}${this.formatModifier(value)}</span>
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
        ? `<ul class="sheet-list text-dim">${extraProfs.map((skill)=>{const label=this.escapeHtml(this.formatSkillName(skill));return`<li>${label}</li>`;}).join('')}</ul>`
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
    const characterLevel = parsed.level || 1;

    // Helper to render spell list
    // isCantrip: if true, apply damage scaling based on level
    const renderSpellList = (spells, isCantrip = false) => {
      const items = spells
        .map((spell) => {
          const isObject = spell && typeof spell === 'object';
          const rawName = isObject ? spell.name : spell;
          const name = this.escapeHtml(rawName || '');
          
          // If spell is a string, try to look up its data from the spell database
          let spellData = null;
          const normalizedName = rawName ? String(rawName).toLowerCase().trim() : '';
          if (!isObject && rawName) {
            spellData = this._lookupSpellData(rawName);
          }
          
          // Also check SPELL_LOOKUP directly for cantrip scaling data
          const lookupData = SPELL_LOOKUP[normalizedName];
          
          // Use data from spell object or looked-up data
          const schoolSource = isObject ? spell.school : spellData?.school;
          let descSource = isObject ? spell.description : spellData?.description;
          
          // Apply cantrip damage scaling if this is a cantrip with baseDice
          if (isCantrip && lookupData?.baseDice && descSource) {
            descSource = this._scaleCantripDescription(
              descSource,
              characterLevel,
              lookupData.baseDice,
              lookupData.special
            );
          }
          
          const school = schoolSource
            ? `<span class="text-dim">(${this.escapeHtml(schoolSource)})</span>`
            : '';
          const desc = descSource
            ? `<div class="text-dim terminal-text-small spell-list-description">${this.escapeHtml(descSource)}</div>`
            : '';
          return `<li class="spell-list-item">${name}${school}${desc}</li>`;
        })
        .join('');
      return `<ul class="sheet-list text-dim">${items}</ul>`;
    };

    let spellsContent = '';

    // Cantrips (with damage scaling based on level)
    if (cantrips.length > 0) {
      spellsContent += `<div class="sheet-subsection"><div class="sheet-subsection-title">CANTRIPS(At-Will)</div>${renderSpellList(cantrips,true)}</div>`;
    }

    // Spell Slots Summary (show all levels with slots)
    const slotLevels = Object.keys(spellSlots)
      .map(k => parseInt(k))
      .filter(k => !isNaN(k) && spellSlots[k] > 0)
      .sort((a, b) => a - b);
    
    if (slotLevels.length > 0) {
      const slotBoxes = slotLevels.map(level => {
        const ordinal = level === 1 ? '1st' : level === 2 ? '2nd' : level === 3 ? '3rd' : `${level}th`;
        return `<div class="spell-slot-box"><div class="spell-slot-label">${ordinal}</div><div class="spell-slot-value">${spellSlots[level]}</div></div>`;
      }).join('');
      
      spellsContent += `<div class="sheet-subsection"><div class="sheet-subsection-title">SPELL SLOTS</div><div class="spell-slots-grid">${slotBoxes}</div></div>`;
    }

    // Known/Prepared Spells
    if (spellsKnown.length > 0 || spellsPrepared.length > 0) {
      const spellList = spellsKnown.length > 0 ? spellsKnown : spellsPrepared;
      const preparedText = spellsPrepared.length > 0 && spellsKnown.length === 0 ? ' (Prepared)' : '';
      
      spellsContent += `<div class="sheet-subsection"><div class="sheet-subsection-title">SPELLS KNOWN${preparedText}</div>${renderSpellList(spellList)}</div>`;
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
    const traitsMarkup = `<ul class="sheet-list text-dim">${parsed.racialTraits.map((trait)=>`<li>${this.escapeHtml(trait)}</li>`).join('')}</ul>`;

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[RACIAL TRAITS]</div></div><div class="sheet-content">${traitsMarkup}</div></div>`;
  },

  _renderEquipment(parsed) {
    const equipmentMarkup = `<ul class="sheet-list text-dim">${parsed.equipment.map((item)=>`<li>${this.escapeHtml(item)}</li>`,).join('')}</ul>`;

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[${parsed.hasClassEquipment?'EQUIPMENT':'CLASS EQUIPMENT'}]</div></div><div class="sheet-content">${equipmentMarkup}</div></div>`;
  },

  _renderToolProficiencies(parsed) {
    const toolsMarkup = `<ul class="sheet-list text-dim">${parsed.toolProficiencies.map((tool)=>{const label=this.escapeHtml(this.formatSkillName(tool));return`<li>${label}</li>`;}).join('')}</ul>`;

    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[TOOL PROFICIENCIES]</div></div><div class="sheet-content">${toolsMarkup}</div></div>`;
  },

  _renderLanguages(parsed) {
    const hasLanguages = parsed.languages.length > 0;
    const hasChoices = parsed.languageChoices > 0;
    
    if (!hasLanguages && !hasChoices) {
      return '';
    }
    
    return `<div class="sheet-section"><div class="sheet-header"><div class="sheet-header-title">[LANGUAGES]</div></div><div class="sheet-content">${hasLanguages?`<ul class="sheet-list text-dim">${parsed.languages
                  .map(
                    (lang) =>
                      `<li>${this.escapeHtml(lang)}</li>`,
                  )
                  .join('')}</ul>`:''}
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
    
    // Calculate ability modifiers if not present but we have ability scores
    let abilityModifiers = character.abilityModifiers || {};
    if (Object.keys(abilityModifiers).length === 0 && Object.keys(abilities).length > 0) {
      abilityModifiers = {};
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        const score = abilities[ability] || 10;
        abilityModifiers[ability] = Math.floor((score - 10) / 2);
      });
    }
    
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

    // Calculate saving throw modifiers if not present but we have the data
    const proficiencyBonus = character.proficiencyBonus || 2;
    const savingThrowProficiencies = character.savingThrows || [];
    let savingThrowModifiers = character.savingThrowModifiers || null;
    
    // If modifiers aren't stored but we have ability modifiers, calculate them
    if (!savingThrowModifiers && Object.keys(abilityModifiers).length > 0) {
      savingThrowModifiers = {};
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        const isProficient = savingThrowProficiencies.includes(ability);
        const mod = abilityModifiers[ability] || 0;
        savingThrowModifiers[ability] = mod + (isProficient ? proficiencyBonus : 0);
      });
    }

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
      hitDiceMax: character.hitDiceMax || character.level || 1,
      hitDiceCurrent: character.hitDiceCurrent ?? character.hitDiceMax ?? character.level ?? 1,

      // Abilities
      abilities,
      abilityModifiers,
      abilitiesSet: abilitiesPopulated,

      // Saving throws
      savingThrows: savingThrowProficiencies,
      savingThrowModifiers,

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

      // Class Resources (Ki, Rage, etc.)
      classResources: character.classResources || {},

      // Flags for conditional rendering
      // In builder, always show sections (except spells until we know they're a caster)
      hasRace: !!raceName,
      hasClass: !!className,
      hasAbilities: isBuilder || Object.keys(abilities).length > 0,
      hasCombatStats: isBuilder || hpMax > 0 || character.armorClass,
      hasSavingThrows: isBuilder || (
        savingThrowModifiers &&
        Object.keys(savingThrowModifiers).length > 0
      ),
      hasSkills: isBuilder || (
        Object.keys(skillModifiers).length > 0 ||
        skillProficiencies.length > 0
      ),
      hasSpells:
        (character.cantrips && character.cantrips.length > 0) ||
        (character.spellsKnown && character.spellsKnown.length > 0) ||
        (character.spellsPrepared && character.spellsPrepared.length > 0),
      hasClassResources: 
        character.classResources && Object.keys(character.classResources).length > 0,
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

    // Guard: ignore legacy pre-generated "original art" URLs that were written
    // into character data. We only want user-generated portrait images to
    // display as original art.
    const isPregenUrl = (url) => {
      if (!url) return false;
      const u = String(url);
      return (
        u.includes('r2.dev/defaults/') ||
        u.includes('r2.dev/portraits/pregen/') ||
        u.includes('generated_portraits/images/')
      );
    };

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
    if (character.originalPortraitUrl && !isPregenUrl(character.originalPortraitUrl)) {
      source = 'originalPortraitUrl';
      result = character.originalPortraitUrl;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    // 2) Exported portrait object from builder
    if (character.portrait && character.portrait.url && !isPregenUrl(character.portrait.url)) {
      source = 'portrait.url';
      result = character.portrait.url;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
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
          return `<div class="terminal-text-small terminal-text-dim portrait-history-callout"><p><strong>No portrait history yet.</strong></p><p>This character's portrait was created before the history feature was added.</p><p>Generate a new custom AI portrait to:</p><ul class="portrait-history-callout-list"><li>Save your current portrait as Version 1</li><li>Add the new portrait as Version 2</li><li>Enable portrait version switching</li></ul></div>`;
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





// ===== BUNDLE PART: character-builder/character-builder-components.js =====

// UI components for the DandDy terminal character builder.
// Exposes Components as a global on window.

const Components = (window.Components = {
  renderNarratorMessage(text) {
    return `<div class="narrator-message"><div class="narrator-text">${text}</div></div>`;
  },

  renderQuestion(question) {
    const optionsHTML = question.options
      .map(
        (opt, index) => `<button class="button-primary"onclick="App.handleAnswer('${question.id}', ${index})">${opt.text}</button>`,
      )
      .join('');

    return `<div class="question-card"data-question-id="${question.id}"><div class="options-container">${optionsHTML}</div></div>`;
  },

  renderTextInput(question) {
    return `<div class="question-card"data-question-id="${question.id}"><div class="question-text">${question.text}</div><input type="text"class="input-field"id="text-input"placeholder="${question.placeholder || 'Type here...'}"><button class="button-primary mt-md"onclick="App.handleTextInput('${question.id}')">CONTINUE</button></div>`;
  },

  renderCharacterSheet(
    character,
    portrait = null,
    showPortrait = true,
    extraOptions = {},
  ) {
    const { showGeneratePortraitButton = true } = extraOptions || {};

    // Use the shared CharacterSheet component
    return `<div class="character-sheet">${CharacterSheet.render(character,{context:'builder',showPortrait:showPortrait,onGeneratePortrait:showGeneratePortraitButton,onRename:true,onTogglePortrait:true,onLevelChange:true,onPrint:true,})}</div>`;
  },

  renderSettings() {
    const currentNarratorId = StorageService.getNarratorId();
    const narratorsList = getNarratorList();

    // Check if current user is admin (decode JWT)
    let isUserAdmin = false;
    try {
      if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
        const token = AuthService.getToken ? AuthService.getToken() : null;
        if (token) {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          isUserAdmin = decoded.role?.toLowerCase() === 'admin';
        }
      }
    } catch (e) {
      // Silent fail - user is not admin
    }

    // Image quality options per model
    const modelQualityOptions = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      // Flux models don't have quality options
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Get default quality for a model
    const getDefaultQuality = (model) => {
      const options = modelQualityOptions[model] || [];
      return options.length > 0 ? options[0].value : null;
    };

    // Get current quality setting for selected model
    const getCurrentImageQuality = (model) => {
      if (!StorageService || typeof StorageService.getImageQuality !== 'function') {
        return getDefaultQuality(model);
      }
      try {
        const quality = StorageService.getImageQuality(model);
        if (quality) return quality;
        // For gpt-image-1, check legacy setting
        if (model === 'gpt-image-1' && StorageService.getHighQualityGPTImage) {
          return StorageService.getHighQualityGPTImage() ? 'high' : 'medium';
        }
        return getDefaultQuality(model);
      } catch (e) {
        return getDefaultQuality(model);
      }
    };

    // Helper to truncate text for options
    const truncate = (text, maxLength) => {
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };

    // Helper to format narrator titles: strip emoji/description and use a clean title.
    const formatNarratorTitle = (narrator) => {
      if (!narrator) return '';
      const base = String(narrator.name || narrator.id || '').trim();
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    // Text speed multiplier: defaults to 1x if not set or invalid.
    const getCurrentTextSpeed = () => {
      if (!StorageService || typeof StorageService.getTextSpeedMultiplier !== 'function') {
        return 1;
      }
      try {
        return StorageService.getTextSpeedMultiplier();
      } catch (e) {
        console.warn('Settings: failed to read text speed multiplier', e);
        return 1;
      }
    };

    const currentTextSpeedMultiplier = getCurrentTextSpeed();

    // Image model preference (for custom AI portraits)
    const getCurrentImageModel = () => {
      if (!StorageService || typeof StorageService.getImageModel !== 'function') {
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
      try {
        return StorageService.getImageModel();
      } catch (e) {
        console.warn('Settings: failed to read image model preference', e);
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
    };

    const currentNarrator =
      narratorsList.find((n) => n.id === currentNarratorId) || narratorsList[0];
    const currentNarratorLabel = currentNarrator
      ? formatNarratorTitle(currentNarrator)
      : 'Choose narrator';

    const narratorOptionsMenu = narratorsList
      .map((narrator) => {
        const label = formatNarratorTitle(narrator);
        const isSelected = narrator.id === currentNarratorId;
        return `<button
class="selector-option${isSelected ? ' is-selected' : ''}"
type="button"
role="option"
data-value="${narrator.id}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${label}</span></button>`;
      })
      .join('');

    const textSpeedOptions = [
      { value: 1, label: 'Normal' },
      { value: 1.5, label: 'Fast (1.5×)' },
      { value: 2, label: 'Very Fast (2×)' },
    ];

    const currentTextSpeedOption =
      textSpeedOptions.find((opt) => opt.value === currentTextSpeedMultiplier) ||
      textSpeedOptions[0];
    const currentTextSpeedLabel = currentTextSpeedOption.label;

    const imageModelOptions = [
      { value: 'dall-e-3', label: 'DALL·E 3 (high detail)' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (OpenAI)' },
      { value: 'flux-1.1-pro', label: 'Flux Pro (high quality)' },
      { value: 'flux-schnell', label: 'Flux Schnell (fast)' },
    ];

    const currentImageModelValue = getCurrentImageModel();
    const currentImageModelOption =
      imageModelOptions.find((opt) => opt.value === currentImageModelValue) ||
      imageModelOptions[0];
    const currentImageModelLabel = currentImageModelOption.label;

    // Quality options for current model
    const currentQualityOptions = modelQualityOptions[currentImageModelValue] || [];
    const currentQualityValue = getCurrentImageQuality(currentImageModelValue);
    const currentQualityOption = currentQualityOptions.find(
      (opt) => opt.value === currentQualityValue,
    ) || currentQualityOptions[0];
    const currentQualityLabel = currentQualityOption?.label || '';
    // Only show quality options to admin users
    const hasQualityOptions = currentQualityOptions.length > 0 && isUserAdmin;

    // Portrait view mode (ASCII vs Original)
    const getPortraitViewMode = () => {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        return StorageService.getPortraitViewMode();
      }
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
    };

    const currentPortraitViewMode = getPortraitViewMode();

    // Portrait prompt theme (for AI-generated portraits)
    const getPortraitPromptTheme = () => {
      try {
        if (window.StorageService && StorageService.getPortraitPromptTheme) {
          return StorageService.getPortraitPromptTheme();
        }
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt theme', e);
      }

      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getDefaultThemeId === 'function'
      ) {
        try {
          return window.PortraitPrompt.getDefaultThemeId();
        } catch (e) {
          // Non-fatal
        }
      }

      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
    };

    const currentPromptThemeId = getPortraitPromptTheme();

    // Trigger API sync if not already done (in case settings opened before auto-sync)
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.syncFromAPI === 'function'
    ) {
      // Fire and forget - will populate cache for next render
      window.PortraitPrompt.syncFromAPI();
    }

    let promptThemes = [];
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.getThemes === 'function'
    ) {
      try {
        promptThemes = window.PortraitPrompt.getThemes() || [];
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt themes', e);
      }
    }

    // Fallback to a single default theme when the helper is unavailable.
    if (!Array.isArray(promptThemes) || !promptThemes.length) {
      promptThemes = [
        {
          id: 'cinematic-inks',
          label: 'Cinematic Inks (default)',
          description:
            'More cinematic lighting and framing while staying in black-and-white ink.',
        },
      ];
    }

    // Sort themes alphabetically by id
    promptThemes = promptThemes.slice().sort((a, b) => {
      const nameA = (a.id || '').toLowerCase();
      const nameB = (b.id || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const activePromptTheme =
      promptThemes.find((t) => t.id === currentPromptThemeId) ||
      promptThemes[0];

    // Helper to format a theme id/label into Title Case name.
    const formatThemeName = (theme) => {
      const rawId = (theme && theme.id) || '';
      // Prefer id so custom themes don't inherit any legacy "(default)" suffixes.
      const base = String(rawId || '').trim() || String(theme.label || '');
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    const currentPromptThemeLabel = activePromptTheme
      ? formatThemeName(activePromptTheme)
      : 'Cinematic Inks';

    return `<div id="settingsModal"class="modal show"onclick="SettingsModal.close()"><div class="modal-content builder-settings-modal"onclick="event.stopPropagation();"><div class="modal-header"><div class="modal-header-main"><h2 class="modal-title">Settings</h2></div><button class="modal-close"onclick="SettingsModal.close()"aria-label="Close settings">&times;</button></div><div class="modal-body"><div class="settings-layout"><div class="settings-grid"><div class="settings-group"><div class="settings-group-label">[Builder]</div><section class="settings-section"><div class="settings-row-inline"><div class="settings-inline-field"><div class="settings-label">Narrator Voice</div><div class="selector-shell selector-shell--listbox selector-shell--match-width"><button
class="terminal-btn selector-trigger"
id="narrator-select-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span class="selector-trigger-label"id="narrator-select-label">${currentNarratorLabel}</span></button><div
class="selector-menu"
role="listbox"
aria-label="Narrator voice"
aria-hidden="true">${narratorOptionsMenu}</div></div><select
id="narrator-select"
class="terminal-select settings-select hidden">${narratorsList.map((narrator)=>{const label=formatNarratorTitle(narrator);return`
                            <option value="${narrator.id}" ${
                              narrator.id === currentNarratorId ? 'selected' : ''
                            }>
                              ${label}
                            </option>
                          `;}).join('')}</select></div><div class="settings-inline-field"><div class="settings-label">Text Speed</div><div class="selector-shell selector-shell--listbox selector-shell--match-width"><button
class="terminal-btn selector-trigger"
id="text-speed-select-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span class="selector-trigger-label"id="text-speed-select-label">${currentTextSpeedLabel}</span></button><div
class="selector-menu"
role="listbox"
aria-label="Narrator text speed"
aria-hidden="true">${textSpeedOptions.map((opt)=>{const isSelected=opt.value===currentTextSpeedOption.value;return`
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
                            `;}).join('')}</div></div><select
id="text-speed-select"
class="terminal-select settings-select hidden">${textSpeedOptions.map((opt)=>`
                            <option value="${opt.value}" ${
                              opt.value === currentTextSpeedOption.value
                                ? 'selected'
                                : ''
                            }>
                              ${opt.label}
                            </option>
                          `,).join('')}</select></div></div></section></div><div class="settings-group"><div class="settings-group-label">[Image generation]</div><section class="settings-section"><div class="settings-row settings-row--stacked mb-lg"><div class="settings-label">Style</div><div class="settings-field"><div class="selector-shell selector-shell--listbox selector-shell--match-width"><button
class="terminal-btn selector-trigger"
id="portrait-theme-select-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span
class="selector-trigger-label"
id="portrait-theme-select-label">${currentPromptThemeLabel}</span></button><div
class="selector-menu"
role="listbox"
aria-label="Portrait prompt theme"
aria-hidden="true">${promptThemes.map((theme)=>{const isSelected=theme.id===activePromptTheme.id;const label=formatThemeName(theme);return`
                                <button
                                  class="selector-option${
                                    isSelected ? ' is-selected' : ''
                                  }"
                                  type="button"
                                  role="option"
                                  data-value="${theme.id}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${label}
                                  </span>
                                </button>
                              `;}).join('')}</div></div><select
id="portrait-theme-select"
class="terminal-select settings-select hidden">${promptThemes.map((theme)=>{const label=formatThemeName(theme);return`
                              <option value="${theme.id}" ${
                                theme.id === activePromptTheme.id ? 'selected' : ''
                              }>
                                ${label}
                              </option>
                            `;}).join('')}</select></div></div><div class="settings-row-inline mb-lg"><div class="settings-inline-field"><div class="settings-label">AI model</div><div class="selector-shell selector-shell--listbox selector-shell--match-width"><button
class="terminal-btn selector-trigger"
id="image-model-select-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span class="selector-trigger-label"id="image-model-select-label">${currentImageModelLabel}</span></button><div
class="selector-menu"
role="listbox"
aria-label="AI model"
aria-hidden="true">${imageModelOptions.map((opt)=>{const isSelected=opt.value===currentImageModelOption.value;return`
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
                              `;}).join('')}</div></div><select
id="image-model-select"
class="terminal-select settings-select hidden">${imageModelOptions.map((opt)=>`
                              <option value="${opt.value}" ${
                                opt.value === currentImageModelOption.value ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,).join('')}</select></div><div class="settings-inline-field settings-inline-field--quality ${hasQualityOptions ? '' : 'hidden'}"id="quality-selector-container"><div class="settings-label">Quality</div><div class="selector-shell selector-shell--listbox selector-shell--match-width"><button
class="terminal-btn selector-trigger"
id="image-quality-select-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span class="selector-trigger-label"id="image-quality-select-label">${currentQualityLabel}</span></button><div
class="selector-menu"
role="listbox"
aria-label="Image quality"
aria-hidden="true"
id="image-quality-options-menu">${currentQualityOptions.map((opt)=>{const isSelected=opt.value===currentQualityOption?.value;return`
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
                              `;}).join('')}</div></div><select
id="image-quality-select"
class="terminal-select settings-select hidden">${currentQualityOptions.map((opt)=>`
                              <option value="${opt.value}" ${
                                opt.value === currentQualityOption?.value ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,).join('')}</select></div></div><div class="settings-row settings-row--stacked"><div class="settings-label">Default portrait view</div><div class="settings-field"><div class="settings-radio-group"role="radiogroup"aria-label="Default portrait view"><label class="settings-radio-option"><input
type="radio"
name="portrait-view-mode"
value="original"
${currentPortraitViewMode==='original'?'checked':''}><span class="settings-radio-label">Image</span></label><label class="settings-radio-option"><input
type="radio"
name="portrait-view-mode"
value="ascii"
${currentPortraitViewMode==='original'?'':'checked'}><span class="settings-radio-label">ASCII</span></label></div></div></div></section></div></div></div></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="SettingsModal.close()">CANCEL</button><button class="terminal-btn terminal-btn-primary"onclick="SettingsModal.save()">SAVE</button></div></div></div>`;
  },
});

// Shared Settings modal used by both the builder and manager screens.
// Handles narrator, text speed, and AI image model preferences.
const SettingsModal = (window.SettingsModal = {
  _escHandler: null,

  open() {
    if (document.getElementById('settingsModal')) return; // Already open

    const settingsHTML = Components.renderSettings();

    // Prefer the main app container when available so the modal is scoped
    // correctly in both builder and manager layouts.
    const host =
      document.querySelector('.terminal-container') ||
      document.querySelector('.terminal-frame') ||
      document.body;

    host.insertAdjacentHTML('beforeend', settingsHTML);

    const modal = document.getElementById('settingsModal');
    if (modal && typeof window.Utils !== 'undefined' && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    this.initSelectors(modal);

    // ESC key to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        SettingsModal.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  /**
   * Initialize settings selectors: wire up option clicks to update the
   * hidden <select> elements and trigger labels.
   * The toggle behavior is handled by onclick="CharacterSheet.toggleSelectorMenu(this)" in the HTML.
   * @param {HTMLElement} modal
   */
  initSelectors(modal) {
    if (!modal) return;

    // Narrator selector
    const narratorTrigger = modal.querySelector('#narrator-select-trigger');
    const narratorLabel = modal.querySelector('#narrator-select-label');
    const narratorSelect = modal.querySelector('#narrator-select');
    const narratorOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator voice"] .selector-option',
    );

    if (narratorTrigger && narratorLabel && narratorSelect && narratorOptions.length) {
      narratorOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            narratorLabel.textContent = label.textContent.trim();
            narratorSelect.value = value;
            // Keep menu selection state in sync with the trigger
            narratorOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Text speed selector
    const speedTrigger = modal.querySelector('#text-speed-select-trigger');
    const speedLabel = modal.querySelector('#text-speed-select-label');
    const speedSelect = modal.querySelector('#text-speed-select');
    const speedOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator text speed"] .selector-option',
    );

    if (speedTrigger && speedLabel && speedSelect && speedOptions.length) {
      speedOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            speedLabel.textContent = label.textContent.trim();
            speedSelect.value = value;
            // Keep menu selection state in sync with the trigger
            speedOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Quality options per model (duplicated here for initSelectors)
    const modelQualityOptionsMap = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Helper to update quality selector options based on selected model
    const updateQualityOptions = (modelValue) => {
      const qualityContainer = modal.querySelector('#quality-selector-container');
      const qualityLabel = modal.querySelector('#image-quality-select-label');
      const qualitySelect = modal.querySelector('#image-quality-select');
      const qualityMenu = modal.querySelector('#image-quality-options-menu');

      const options = modelQualityOptionsMap[modelValue] || [];

      // Check if current user is admin (decode JWT)
      let isAdmin = false;
      try {
        if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
          const token = AuthService.getToken ? AuthService.getToken() : null;
          if (token) {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            isAdmin = decoded.role?.toLowerCase() === 'admin';
          }
        }
      } catch (e) {
        // Silent fail - user is not admin
      }

      if (!options.length || !isAdmin) {
        // Hide quality selector if model has no quality options or user is not admin
        if (qualityContainer) qualityContainer.classList.add('hidden');
        return;
      }

      // Show quality selector (admin only)
      if (qualityContainer) qualityContainer.classList.remove('hidden');

      // Get saved quality for this model, or default to first option
      let currentQuality = null;
      if (window.StorageService && StorageService.getImageQuality) {
        currentQuality = StorageService.getImageQuality(modelValue);
      }
      if (!currentQuality) {
        currentQuality = options[0].value;
      }

      // Update menu options
      if (qualityMenu) {
        qualityMenu.innerHTML = options
          .map((opt) => {
            const isSelected = opt.value === currentQuality;
            return `<button
class="selector-option${isSelected ? ' is-selected' : ''}"
type="button"
role="option"
data-value="${opt.value}"
aria-selected="${isSelected ? 'true' : 'false'}"><span class="selector-option-label">${opt.label}</span></button>`;
          })
          .join('');

        // Re-wire quality option clicks
        const newQualityOptions = qualityMenu.querySelectorAll('.selector-option');
        newQualityOptions.forEach((qOpt) => {
          qOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            const qValue = qOpt.getAttribute('data-value');
            const qLabel = qOpt.querySelector('.selector-option-label');
            if (qValue && qLabel && qualityLabel && qualitySelect) {
              qualityLabel.textContent = qLabel.textContent.trim();
              qualitySelect.value = qValue;
              newQualityOptions.forEach((o) => {
                const isSelected = o === qOpt;
                o.classList.toggle('is-selected', isSelected);
                o.setAttribute('aria-selected', isSelected ? 'true' : 'false');
              });
            }
          });
        });
      }

      // Update hidden select options
      if (qualitySelect) {
        qualitySelect.innerHTML = options
          .map(
            (opt) => `<option value="${opt.value}"${opt.value===currentQuality?'selected':''}>${opt.label}</option>`,
          )
          .join('');
      }

      // Update label
      const activeOption = options.find((o) => o.value === currentQuality) || options[0];
      if (qualityLabel && activeOption) {
        qualityLabel.textContent = activeOption.label;
      }
    };

    // Image model selector
    const imageModelTrigger = modal.querySelector('#image-model-select-trigger');
    const imageModelLabel = modal.querySelector('#image-model-select-label');
    const imageModelSelect = modal.querySelector('#image-model-select');
    const imageModelOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="AI model"] .selector-option',
    );

    if (imageModelTrigger && imageModelLabel && imageModelSelect && imageModelOptions.length) {
      imageModelOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            imageModelLabel.textContent = label.textContent.trim();
            imageModelSelect.value = value;
            // Keep menu selection state in sync with the trigger
            imageModelOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            // Update quality options when model changes
            updateQualityOptions(value);
          }
        });
      });
    }

    // Image quality selector (initial setup)
    const qualityTrigger = modal.querySelector('#image-quality-select-trigger');
    const qualityLabel = modal.querySelector('#image-quality-select-label');
    const qualitySelect = modal.querySelector('#image-quality-select');
    const qualityOptions = modal.querySelectorAll(
      '#image-quality-options-menu .selector-option',
    );

    if (qualityTrigger && qualityLabel && qualitySelect && qualityOptions.length) {
      qualityOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            qualityLabel.textContent = label.textContent.trim();
            qualitySelect.value = value;
            qualityOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Portrait prompt theme selector
    const themeTrigger = modal.querySelector(
      '#portrait-theme-select-trigger',
    );
    const themeLabel = modal.querySelector('#portrait-theme-select-label');
    const themeSelect = modal.querySelector('#portrait-theme-select');
    const themeOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Portrait prompt theme"] .selector-option',
    );

    if (themeTrigger && themeLabel && themeSelect && themeOptions.length) {
      themeOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            themeLabel.textContent = label.textContent.trim();
            themeSelect.value = value;
            // Keep menu selection state in sync with the trigger
            themeOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }
  },

  close() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  save() {
    // Save narrator selection
    const narratorSelect = document.getElementById('narrator-select');
    if (narratorSelect && window.StorageService && StorageService.setNarratorId) {
      StorageService.setNarratorId(narratorSelect.value);
    }

    // Save text speed selection
    const textSpeedSelect = document.getElementById('text-speed-select');
    if (textSpeedSelect && window.StorageService && StorageService.setTextSpeedMultiplier) {
      StorageService.setTextSpeedMultiplier(textSpeedSelect.value);
    }

    // Save portrait image model selection
    const imageModelSelect = document.getElementById('image-model-select');
    if (imageModelSelect && window.StorageService && StorageService.setImageModel) {
      StorageService.setImageModel(imageModelSelect.value);
    }

    // Save global portrait view mode (ASCII vs Original)
    // Track if mode changed to trigger UI refresh
    let portraitModeChanged = false;
    const portraitModeInput = document.querySelector(
      'input[name="portrait-view-mode"]:checked',
    );
    if (portraitModeInput && window.StorageService && StorageService.setPortraitViewMode) {
      const oldMode = StorageService.getPortraitViewMode ? StorageService.getPortraitViewMode() : null;
      const newMode = portraitModeInput.value;
      if (oldMode !== newMode) {
        portraitModeChanged = true;
      }
      StorageService.setPortraitViewMode(newMode);
    }

    // Save portrait prompt theme selection
    const portraitThemeSelect = document.getElementById('portrait-theme-select');
    if (
      portraitThemeSelect &&
      window.StorageService &&
      StorageService.setPortraitPromptTheme
    ) {
      StorageService.setPortraitPromptTheme(portraitThemeSelect.value);
    }

    // Save image quality setting for the selected model
    const imageQualitySelect = document.getElementById('image-quality-select');
    const imageModelForQuality = imageModelSelect?.value;
    if (imageQualitySelect && imageModelForQuality && window.StorageService && StorageService.setImageQuality) {
      StorageService.setImageQuality(imageModelForQuality, imageQualitySelect.value);
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved');
    } else if (typeof showNotification === 'function') {
      showNotification('Settings saved');
    }

    this.close();

    // If portrait view mode changed, refresh the UI to update images
    if (portraitModeChanged) {
      // Character Manager context: re-render grid and current sheet
      if (typeof UI !== 'undefined' && UI && typeof UI.renderCharacterGrid === 'function') {
        UI.renderCharacterGrid();
        // Re-render the current character sheet if one is selected
        if (typeof AppState !== 'undefined' && AppState && AppState.selectedCharacterId) {
          const selectedChar = AppState.filteredCharacters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          ) || AppState.characters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          );
          if (selectedChar) {
            UI.showCharacterSheet(selectedChar);
          }
        }
      }
      // Character Builder context: re-render completion screen if on that step
      if (typeof App !== 'undefined' && App && typeof CharacterState !== 'undefined') {
        const state = CharacterState.get ? CharacterState.get() : null;
        if (state && state.step === 'complete' && state.character) {
          // Re-render the character panel to reflect the new view mode
          const panel = document.getElementById('character-panel');
          if (panel && typeof Components !== 'undefined' && Components.renderCharacterSheet) {
            panel.innerHTML = Components.renderCharacterSheet(state.character);
            // Populate the ASCII portrait after rendering
            if (typeof CharacterSheet !== 'undefined' && CharacterSheet.populatePortrait) {
              CharacterSheet.populatePortrait(state.character);
            }
          }
        }
      }
    }
  },
});




// ===== BUNDLE PART: character-builder/character-builder-questions.js =====

// Question flow definition for the DandDy terminal character builder.
// Exposes QUESTIONS as a global on window.

const QUESTIONS = (window.QUESTIONS = [
  {
    id: 'intro',
    type: 'message',
    text: `>SYSTEM INITIALIZED...\n>LOADING CHARACTER CREATION PROTOCOL...\n>\n>Ah.${' '}Another soul seeking adventure.${' '}Or at least,${' '}trying to.\n>\n>Look,${' '}I've done this a thousand times.${''}You'll make choices.${' '}I'll pretend they matter.${''}We'll both get through this.\n>\n>Let's start with something easy...`,
    next: 'entry-mode',
  },

  {
    id: 'entry-mode',
    type: 'choice',
    text: 'How would you like to create your character?',
    options: [
      {
        text: 'Co-create with the narrator (guided mode)',
        value: 'guided',
      },
      {
        text: 'Quick create (let the system roll everything)',
        value: 'quick',
      },
    ],
    next: 'motivation',
  },

  {
    id: 'motivation',
    type: 'choice',
    text: 'What draws you to the adventuring life?',
    options: [
      { text: 'Glory and heroism', value: 'glory', trait: 'heroic' },
      { text: 'Gold and treasure', value: 'gold', trait: 'greedy' },
      { text: 'Escaping my past', value: 'escape', trait: 'mysterious' },
      { text: 'Just bored, honestly', value: 'bored', trait: 'casual' },
    ],
    aiPromptContext: 'player motivation for adventuring',
    next: 'playstyle',
  },

  {
    id: 'playstyle',
    type: 'choice',
    text: 'What kind of playstyle sounds most fun to you?',
    options: [
      {
        text: 'Sneaky and tactical',
        value: 'sneaky',
      },
      {
        text: 'Tanky and hard to kill',
        value: 'tanky',
      },
      {
        text: 'Social and talkative',
        value: 'social',
      },
      {
        text: 'Blasting things from the back line',
        value: 'blaster',
      },
    ],
    aiPromptContext: 'player preferred combat and roleplay playstyle',
    next: 'sex-choice',
  },

  {
    id: 'sex-choice',
    type: 'choice',
    text: 'And this character of yours — what form do they take?',
    options: [
      {
        text: 'Male',
        value: 'male',
      },
      {
        text: 'Female',
        value: 'female',
      },
    ],
    saveTo: 'sex',
    aiPromptContext: 'character biological sex',
    next: 'physicality',
  },

  {
    id: 'physicality',
    type: 'choice',
    text: 'And physically, how would you describe yourself?',
    options: [
      {
        text: 'Strong and imposing',
        value: 'strong',
        suggests: ['fighter', 'barbarian', 'paladin'],
      },
      {
        text: 'Quick and nimble',
        value: 'nimble',
        suggests: ['rogue', 'ranger', 'monk'],
      },
      {
        text: 'Mystically gifted',
        value: 'mystical',
        suggests: ['wizard', 'sorcerer', 'warlock'],
      },
      {
        text: 'Unremarkable, honestly',
        value: 'average',
        suggests: ['bard', 'cleric', 'druid'],
      },
    ],
    aiPromptContext: 'player physical description',
    next: 'social',
  },

  {
    id: 'social',
    type: 'choice',
    text: 'In social situations, you tend to be...',
    options: [
      {
        text: 'Charismatic and charming',
        value: 'charismatic',
        suggests: ['bard', 'paladin', 'sorcerer', 'warlock'],
      },
      {
        text: 'Observant and quiet',
        value: 'observant',
        suggests: ['rogue', 'ranger', 'druid'],
      },
      {
        text: 'Intimidating',
        value: 'intimidating',
        suggests: ['barbarian', 'fighter'],
      },
      {
        text: 'Awkward but well-meaning',
        value: 'awkward',
        suggests: ['wizard', 'cleric', 'monk'],
      },
    ],
    aiPromptContext: 'player social tendencies',
    next: 'race-suggest',
  },

  {
    id: 'race-suggest',
    type: 'suggestion',
    text: 'Analyzing your responses... ( ._. )',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Map answers to race suggestions
      if (answers.physicality === 'strong') {
        suggestions.push('dwarf', 'half-orc', 'dragonborn');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('elf', 'halfling', 'half-elf');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('tiefling', 'elf', 'gnome');
      }
      if (answers.physicality === 'average') {
        suggestions.push('human', 'half-elf', 'halfling');
      }

      if (answers.social === 'charismatic') {
        suggestions.push('human', 'half-elf', 'tiefling');
      }
      if (answers.social === 'observant') {
        suggestions.push('elf', 'gnome');
      }
      if (answers.social === 'intimidating') {
        suggestions.push('half-orc', 'dragonborn', 'dwarf');
      }
      if (answers.social === 'awkward') {
        suggestions.push('gnome', 'halfling', 'tiefling');
      }

      // Get top 3 most suggested
      const counts = {};
      suggestions.forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
      const top3 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([race]) => race);

      return {
        message:
          'Based on your answers, you seem like the type who would be... let me think...',
        suggestions: top3.length === 3 ? top3 : ['human', 'elf', 'dwarf'],
      };
    },
    next: 'race-choice',
  },

  {
    id: 'race-choice',
    type: 'list-choice',
    text: 'Choose your race:',
    options: DND_DATA.races.map((r) => ({
      text: `${r.name}-${r.description}`,
      value: r.id,
    })),
    saveTo: 'race',
    next: 'class-suggest',
  },

  {
    id: 'class-suggest',
    type: 'suggestion',
    text: 'Interesting choice. Now for your class...',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Physicality preferences
      if (answers.physicality === 'strong') {
        suggestions.push('fighter', 'barbarian', 'paladin');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('rogue', 'ranger', 'monk');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('wizard', 'sorcerer', 'warlock');
      }

      // Social tendencies
      if (answers.social === 'charismatic') {
        suggestions.push('bard', 'paladin', 'warlock');
      }

      // Playstyle preferences (sneaky / tanky / social / blaster)
      if (answers.playstyle === 'sneaky') {
        suggestions.push('rogue', 'ranger', 'monk');
      }
      if (answers.playstyle === 'tanky') {
        suggestions.push('barbarian', 'fighter', 'paladin');
      }
      if (answers.playstyle === 'social') {
        suggestions.push('bard', 'paladin', 'warlock');
      }
      if (answers.playstyle === 'blaster') {
        suggestions.push('wizard', 'sorcerer', 'warlock');
      }

      // If we collected multiple ideas, bias toward the ones that appear more often
      const counts = {};
      suggestions.forEach((cls) => {
        counts[cls] = (counts[cls] || 0) + 1;
      });
      const ranked = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([cls]) => cls);

      const finalSuggestions =
        ranked.length > 0 ? ranked.slice(0, 3) : ['fighter', 'wizard', 'rogue'];

      return {
        message: 'Given your choices, might I suggest...',
        suggestions: finalSuggestions,
      };
    },
    next: 'class-choice',
  },

  {
    id: 'class-choice',
    type: 'list-choice',
    text: 'Choose your class:',
    options: DND_DATA.classes.map((c) => ({
      text: `${c.name}-${c.description}`,
      value: c.id,
    })),
    saveTo: 'class',
    next: 'abilities',
  },

  {
    id: 'abilities',
    type: 'abilities',
    text: 'Time to roll your ability scores. Choose your method:',
    options: [
      {
        text: 'Standard Array (15, 14, 13, 12, 10, 8)',
        value: 'standard',
      },
      { text: 'Roll 4d6 (drop lowest)', value: 'roll' },
    ],
    // Next question is chosen dynamically in handleAbilityMethod
    // based on class (spellcaster or not) and entry mode (guided vs quick).
    next: 'background-choice',
  },

  // === SPELL SELECTION (Guided Mode) ===
  {
    id: 'spell-style-intro',
    type: 'message',
    text: `>Ah,${' '}right.${' '}You're a spellcaster.\n>  \n>  *sighs*\n>  \n>  I suppose we should talk about your magical abilities.${''}Because what's an adventure without someone hurling fireballs or dramatically shouting healing incantations?\n>\n>Let's figure out your spell preferences...`,
    next: 'spell-style',
  },

  {
    id: 'spell-style',
    type: 'choice',
    text: 'What draws you to magic?',
    options: [
      {
        text: 'Blasting things into oblivion',
        value: 'offense',
        trait: 'aggressive',
      },
      {
        text: 'Protecting myself and allies',
        value: 'defense',
        trait: 'protective',
      },
      {
        text: 'Controlling the battlefield',
        value: 'control',
        trait: 'tactical',
      },
      {
        text: 'Practical utility and tricks',
        value: 'utility',
        trait: 'clever',
      },
    ],
    saveTo: 'spellStyle',
    next: 'spell-element',
  },

  {
    id: 'spell-element',
    type: 'choice',
    text: 'And if you had to pick a magical specialty...',
    options: [
      { text: 'Fire and flames', value: 'fire' },
      { text: 'Ice and cold', value: 'cold' },
      { text: 'Lightning and storms', value: 'lightning' },
      { text: 'Shadows and darkness', value: 'necrotic' },
      { text: 'Light and radiance', value: 'radiant' },
      { text: "Whatever's most effective", value: 'versatile' },
    ],
    saveTo: 'spellElement',
    next: 'spell-selection-guided',
  },

  {
    id: 'spell-selection-guided',
    type: 'spell-selection',
    mode: 'guided',
    text: 'Based on your preferences, here are your recommended spells...',
    next: 'background-choice',
  },

  // === SPELL SELECTION (Quick Mode) ===
  {
    id: 'spell-quick-mode',
    type: 'spell-selection',
    mode: 'quick',
    text: 'Auto-selecting balanced starter spells...',
    next: 'background-choice',
  },

  {
    id: 'background-choice',
    type: 'list-choice',
    text: 'What was your life before adventuring?',
    options: DND_DATA.backgrounds.map((b) => ({
      text: `${b.name}-${b.description}`,
      value: b.id,
    })),
    saveTo: 'background',
    next: 'alignment-choice',
  },

  {
    id: 'alignment-choice',
    type: 'list-choice',
    text: 'And your moral compass points toward...',
    options: DND_DATA.alignments.map((a) => ({
      text: `${a.name}-${a.description}`,
      value: a.id,
    })),
    saveTo: 'alignment',
    next: 'name-choice',
  },

  {
    id: 'name-choice',
    type: 'name',
    text: 'Finally, what shall we call you?',
    next: 'backstory',
  },

  {
    id: 'backstory',
    type: 'backstory',
    text: 'Generating your backstory...',
    next: 'complete',
  },

  {
    id: 'complete',
    type: 'complete',
    text: "Well. That's done. Your character is ready. Try not to die immediately.",
  },
]);







// ===== BUNDLE PART: character-builder/character-builder-app.js =====

// Core app logic and keyboard navigation for the DandDy terminal character builder.
// Exposes App and KeyboardNav as globals on window.

// ===== KEYBOARD NAVIGATION =====

const KeyboardNav = (window.KeyboardNav = {
  currentFocusIndex: 0,
  isActive: false,
  retryCount: 0,

  activate() {
    this.isActive = true;
    // Focus on the first button of the last question by default
    const buttons = this.getActiveButtons();
    if (buttons.length > 0) {
      // Find the first button in the last question card
      const allCards = document.querySelectorAll('.question-card');
      const lastCard = allCards[allCards.length - 1];
      const lastCardButtons = buttons.filter((btn) => lastCard.contains(btn));

      if (lastCardButtons.length > 0) {
        this.currentFocusIndex = buttons.indexOf(lastCardButtons[0]);
      } else {
        this.currentFocusIndex = 0;
      }
    } else {
      this.currentFocusIndex = 0;
    }
    this.retryCount = 0;
    // Wait for DOM to update before focusing
    this.tryActivate();
  },

  /**
   * Calculate a reasonable default Armor Class based on class, abilities,
   * and a simplified 5e armor model.
   *
   * Precedence:
   * - If class is Barbarian/Monk *and* no armorCategory is set → Unarmored Defense.
   * - Otherwise, if armorCategory is set → use armor + optional shield.
   * - Otherwise → 10 + DEX mod (no armor).
   */
  calculateArmorClassForClass(classId, abilities, armorCategory = null, hasShield = false) {
    const dexMod = Utils.abilityModifier(abilities.dex);
    const conMod = Utils.abilityModifier(abilities.con);
    const wisMod = Utils.abilityModifier(abilities.wis);

    // Unarmored Defense for Barbarian/Monk when not wearing armor
    if (classId === 'barbarian' && !armorCategory) {
      return 10 + dexMod + conMod;
    }
    if (classId === 'monk' && !armorCategory) {
      return 10 + dexMod + wisMod;
    }

    // Armor-based AC when an armor category is present
    let baseAC;
    switch (armorCategory) {
      case 'light':
        // Typical light armor baseline (leather): 11 + DEX
        baseAC = 11 + dexMod;
        break;
      case 'medium':
        // Typical medium armor (scale mail): 14 + min(DEX, +2)
        baseAC = 14 + Math.min(dexMod, 2);
        break;
      case 'heavy':
        // Typical heavy armor (chain mail): fixed 16, no DEX
        baseAC = 16;
        break;
      default:
        // No armor: 10 + DEX
        baseAC = 10 + dexMod;
        break;
    }

    if (hasShield) {
      baseAC += 2;
    }

    return baseAC;
  },

  /**
   * Infer a coarse armor loadout (armor category + shield) from the class's
   * starting equipment text. This doesn't try to be exhaustive – it gives us
   * stable fields we can later surface in UI.
   */
  inferArmorLoadoutForClass(classId) {
    const cls = DND_DATA.classes.find((c) => c.id === classId);
    if (!cls || !Array.isArray(cls.equipment)) {
      return { armorCategory: null, hasShield: false };
    }

    const equipmentText = cls.equipment.join(' ').toLowerCase();

    let armorCategory = null;
    if (equipmentText.includes('leather armor') || equipmentText.includes('light armor')) {
      armorCategory = 'light';
    } else if (equipmentText.includes('medium armor')) {
      armorCategory = 'medium';
    } else if (equipmentText.includes('heavy armor')) {
      armorCategory = 'heavy';
    }

    const hasShield =
      equipmentText.includes('shield') ||
      equipmentText.includes('wooden shield');

    return { armorCategory, hasShield };
  },

  /**
   * Map an armorCategory + class into concrete armor item strings that should
   * appear in the equipment list (e.g., "Leather Armor", "Chain Mail", "Shield").
   */
  getStartingArmorItems(classId, armorCategory, hasShield) {
    const items = [];

    if (armorCategory === 'light') {
      items.push('Leather Armor');
    } else if (armorCategory === 'medium') {
      // Barbarians often start in hide; others in scale mail.
      if (classId === 'barbarian') {
        items.push('Hide Armor');
      } else {
        items.push('Scale Mail');
      }
    } else if (armorCategory === 'heavy') {
      items.push('Chain Mail');
    }

    if (hasShield) {
      // Druids/clerics often have wooden shields; others a generic shield.
      if (classId === 'druid' || classId === 'cleric') {
        items.push('Wooden Shield');
      } else {
        items.push('Shield');
      }
    }

    return items;
  },

  tryActivate() {
    setTimeout(() => {
      const buttons = this.getActiveButtons();

      if (buttons.length > 0) {
        this.updateFocus();
      } else if (this.retryCount < 10) {
        // Retry up to 10 times (1 second total)
        this.retryCount++;
        this.tryActivate();
      }
    }, 100);
  },

  deactivate() {
    this.isActive = false;
    this.clearFocus();
  },

  getActiveButtons() {
    // Get ALL question cards
    const allCards = document.querySelectorAll('.question-card');

    if (allCards.length === 0) {
      return [];
    }

    // Get ALL clickable buttons from ALL cards
    const allButtons = [];
    allCards.forEach((card) => {
      const cardButtons = Array.from(card.querySelectorAll('.button-primary'));
      // Include all buttons (selected, locked, etc) - they're all clickable now
      cardButtons.forEach((btn) => {
        // Skip only truly disabled buttons (like name input buttons after selection)
        if (!btn.hasAttribute('disabled')) {
          allButtons.push(btn);
        }
      });
    });

    return allButtons;
  },

  updateFocus() {
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) {
      return;
    }

    // Remove focus from all buttons
    buttons.forEach((btn) => btn.classList.remove('is-focused'));

    // Add focus to current index
    if (buttons[this.currentFocusIndex]) {
      const focusedButton = buttons[this.currentFocusIndex];
      focusedButton.classList.add('is-focused');

      // Scroll the focused button into view
      focusedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  },

  clearFocus() {
    const buttons = this.getActiveButtons();
    buttons.forEach((btn) => btn.classList.remove('is-focused'));
  },

  moveUp() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the top
    this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 1);
    this.updateFocus();
  },

  moveDown() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the bottom
    this.currentFocusIndex = Math.min(buttons.length - 1, this.currentFocusIndex + 1);
    this.updateFocus();
  },

  // Horizontal navigation mirrors vertical movement for now:
  // buttons are laid out linearly, but when they appear side by side,
  // Left/Right should feel like moving between siblings.
  moveLeft() {
    this.moveUp();
  },

  moveRight() {
    this.moveDown();
  },

  select() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    const button = buttons[this.currentFocusIndex];
    if (button) {
      button.click();
      this.deactivate();
    }
  },
});

// ===== APP LOGIC =====

// Track current portrait style selected in modal (module-level like manager)
let currentBuilderPortraitStyle = null;

/**
 * Format style ID to display label (title case, no dashes/underscores)
 */
function formatStyleLabelBuilder(idOrLabel) {
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
 * Uses the same selector pattern as the settings modal and manager.
 * 
 * This is now async to properly wait for API sync before fetching themes.
 */
async function populateBuilderPortraitStyleDropdown(activeStyle) {
  const menu = document.getElementById('builderPortraitStyleMenu');
  const label = document.getElementById('builderPortraitStyleLabel');
  if (!menu) return null;

  // Clear existing options
  menu.innerHTML = '';

  // Wait for API sync to complete before fetching themes
  // This ensures global styles are loaded for authenticated users
  if (window.PortraitPrompt && typeof PortraitPrompt.syncFromAPI === 'function') {
    try {
      await PortraitPrompt.syncFromAPI();
    } catch (e) {
      console.warn('populateBuilderPortraitStyleDropdown: API sync failed', e);
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
    console.warn('populateBuilderPortraitStyleDropdown: Error getting themes', e);
  }

  // Always ensure at least the default theme is available
  if (!themes.length) {
    themes = [
      { id: 'cinematic-inks', label: 'Cinematic Inks (default)' }
    ];
  }

  // Sort themes alphabetically by id
  themes = themes.slice().sort((a, b) => {
    const nameA = (a.id || '').toLowerCase();
    const nameB = (b.id || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Determine selected value
  const selectedStyle = activeStyle || defaultThemeId;
  let selectedLabel = formatStyleLabelBuilder(defaultThemeId);

  // Populate menu with options (same pattern as settings modal)
  themes.forEach((theme) => {
    const formattedLabel = formatStyleLabelBuilder(theme.id);
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

  currentBuilderPortraitStyle = selectedStyle;
  
  // Wire up option clicks
  initBuilderPortraitStyleSelector();
  
  return selectedStyle;
}

/**
 * Initialize the portrait style selector click handlers.
 * Uses the same pattern as manager.
 */
function initBuilderPortraitStyleSelector() {
  const menu = document.getElementById('builderPortraitStyleMenu');
  const label = document.getElementById('builderPortraitStyleLabel');
  const trigger = document.getElementById('builderPortraitStyleTrigger');
  
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
        currentBuilderPortraitStyle = value;
        
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

const App = (window.App = {
  currentQuestion: null,
  _lastRenderedCharacter: null,
  _PORTRAIT_HISTORY_MAX_VERSIONS: 5,
  // When true, the next character-panel update will render portraits without
  // re-running the ASCII "type-in" animation (used for non-visual updates like save).
  _suppressNextPortraitAnimation: false,

  async init() {
    console.log('Initializing Character Builder...');

    // Subscribe to state changes
    CharacterState.subscribe((state) => {
      this.updateCharacterPanel(state.character);
    });

    // Check URL for explicit resume parameter
    const urlParams = new URLSearchParams(window.location.search);
    const forceResume = urlParams.get('resume') === 'true';
    const forceNew = urlParams.get('new') === 'true';

    // Check for existing session to resume
    if (!forceNew && CharacterState.hasSession()) {
      const preview = CharacterState.getSessionPreview();
      
      if (forceResume) {
        // URL says resume - do it immediately
        await this._resumeSession();
        return;
      }
      
      // Show resume prompt
      await this._showResumePrompt(preview);
      return;
    }

    // Start fresh
    await this._startNewCharacter();
  },

  // Resume from saved session
  async _resumeSession() {
    console.log('Resuming character builder session...');
    const resumeQuestionId = CharacterState.restoreSession();
    OptionVariationsCache.reset(); // Clear variation cache (may regenerate)
    this._lastPortraitArt = null;
    
    // Update character panel with restored data
    const character = CharacterState.get().character;
    this.updateCharacterPanel(character);
    
    // Show a brief "resuming" message then continue
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    const messageEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, '> SESSION RESTORED. Let\'s continue where we left off...');
    Utils.scrollToBottom(true);
    await Utils.sleep(1000);
    
    // Check if character is complete (has all required fields)
    // If so, jump straight to the completion screen regardless of currentQuestionId
    const isCharacterComplete = character.name && character.race && 
                                 character.class && character.background && 
                                 character.alignment;
    
    if (isCharacterComplete) {
      await this.showQuestion('complete');
    } else {
    // Jump to the question we were on
    await this.showQuestion(resumeQuestionId || 'intro');
    }
  },

  // Start a brand new character
  async _startNewCharacter() {
    CharacterState.reset();
    OptionVariationsCache.reset();
    this._lastPortraitArt = null;
    await this.showQuestion('intro');
  },

  // Show modal asking user if they want to resume
  async _showResumePrompt(preview) {
    const modal = document.getElementById('sessionResumeModal');
    const timeStampEl = document.getElementById('sessionTimeStamp');
    const resumeBtn = document.getElementById('sessionResumeBtn');
    const discardBtn = document.getElementById('sessionDiscardBtn');
    
    // Format the time if available
    let timeNote = '';
    if (preview.savedAt) {
      const savedDate = new Date(preview.savedAt);
      const now = new Date();
      const diffMs = now - savedDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) {
        timeNote = 'saved moments ago';
      } else if (diffMins < 60) {
        timeNote = `saved ${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeNote = `saved ${diffHours}h ago`;
      } else {
        timeNote = `saved ${savedDate.toLocaleDateString()}`;
      }
    }

    // Update timestamp in header
    timeStampEl.textContent = timeNote;
    
    // Show the modal
    modal.classList.add('show');
    
    // Handle button clicks
    return new Promise((resolve) => {
      const handleResume = async () => {
        cleanup();
        modal.classList.remove('show');
        await this._resumeSession();
        resolve();
      };
      
      const handleDiscard = async () => {
        cleanup();
        modal.classList.remove('show');
        CharacterState.clearSession();
        await this._startNewCharacter();
        resolve();
      };
      
      const cleanup = () => {
        resumeBtn.removeEventListener('click', handleResume);
        discardBtn.removeEventListener('click', handleDiscard);
      };
      
      resumeBtn.addEventListener('click', handleResume);
      discardBtn.addEventListener('click', handleDiscard);
    });
  },

  // Show progressive "thinking" messages while waiting for AI
  showProgressiveThinking(element) {
    if (!element) return;
    
    // Clear any existing interval
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
    }
    
    let elapsed = 0;
    // Cube markup used inside a narrator-spinner-shell so that whitespace
    // behavior is controlled and the cube + text stay on a single line.
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

    const renderLine = (text) =>
      `<span class="narrator-spinner-shell">${cubeMarkup}${text}</span>`;

    element.innerHTML = renderLine('rolling the dice...');
    
    this._thinkingInterval = setInterval(() => {
      elapsed++;
      
      if (elapsed < 3) {
        element.innerHTML = renderLine('rolling the dice...');
      } else if (elapsed < 6) {
        element.innerHTML = renderLine('still rolling...');
      } else {
        element.innerHTML = renderLine('server waking up... hang tight!');
      }
    }, 1000); // Update every second
  },
  
  stopProgressiveThinking() {
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
      this._thinkingInterval = null;
    }
  },

  async showQuestion(questionId) {
    const question = QUESTIONS.find((q) => q.id === questionId);
    if (!question) {
      console.error('Question not found:', questionId);
      return;
    }

    this.currentQuestion = question;
    // Track current question for session persistence
    CharacterState.setCurrentQuestion(questionId);
    const narratorPanel = document.getElementById('narrator-panel');

    // Handle different question types
    switch (question.type) {
      case 'message':
        await this.showMessage(question);
        break;
      case 'choice':
        await this.showChoice(question);
        break;
      case 'list-choice':
        await this.showListChoice(question);
        break;
      case 'suggestion':
        await this.showSuggestion(question);
        break;
      case 'abilities':
        await this.showAbilities(question);
        break;
      case 'name':
        await this.showNameChoice(question);
        break;
      case 'backstory':
        await this.showBackstory(question);
        break;
      case 'complete':
        await this.showComplete(question);
        break;
      case 'spell-selection':
        await this.showSpellSelection(question);
        break;
    }
  },

  async showMessage(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // For intro message, use narrator-specific intro text
    let messageText = question.text;
    if (question.id === 'intro') {
      const narratorId = StorageService.getNarratorId();
      const narrator = getNarrator(narratorId);
      messageText = narrator.introText;
    }

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, messageText);
    Utils.scrollToBottom(true);

    if (question.next) {
      messageEl.classList.add('is-waiting');
      await Utils.sleep(1500);
      messageEl.classList.remove('is-waiting');
      await this.showQuestion(question.next);
    }
  },

  async showChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    
    // For entry-mode question, check creation quota first
    if (question.id === 'entry-mode') {
      let quotaInfo = null;
      try {
        quotaInfo = await AIService.getCreationQuotaStatus();
      } catch (e) {
        // Non-fatal: quota check failed, allow user to proceed
        console.warn('Creation quota check failed:', e);
      }

      // Store quota info for later display
      this._creationQuotaInfo = quotaInfo;
    }

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);
    const variedQuestion = { ...question, options: variedOptions };

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderQuestion(variedQuestion),
    );

    // For entry-mode, add quota info inside the options box
    if (question.id === 'entry-mode' && this._creationQuotaInfo) {
      const qi = this._creationQuotaInfo;
      const questionCard = narratorPanel.querySelector(`.question-card[data-question-id="${question.id}"]`);
      const optionsContainer = questionCard?.querySelector('.options-container');
      
      // Only show if enforced (remaining !== -1 means quota is enforced)
      if (qi.remaining !== -1 && optionsContainer) {
        const quotaLine = document.createElement('div');
        quotaLine.className = 'creation-quota-info';
        
        if (qi.remaining === 0) {
          // Format reset time nicely
          let resetText = 'Resets tomorrow';
          if (qi.resetAt) {
            try {
              const resetDate = new Date(qi.resetAt);
              const now = new Date();
              const hoursUntil = Math.ceil((resetDate - now) / (1000 * 60 * 60));
              if (hoursUntil <= 1) {
                resetText = 'Resets in about an hour';
              } else if (hoursUntil < 24) {
                resetText = `Resets in about ${hoursUntil}hours`;
              }
            } catch (_) {}
          }
          quotaLine.textContent = `You've reached today's limit.${resetText}.`;
          quotaLine.classList.add('is-exhausted');
          
          // Disable the option buttons
          const buttons = questionCard.querySelectorAll('.button-primary');
          buttons.forEach(btn => {
            btn.disabled = true;
            btn.title = "Daily character creation limit reached";
            btn.classList.add('is-quota-disabled');
          });
          
          // Add a back button
          optionsContainer.insertAdjacentHTML(
            'beforeend',
            `<button class="button-primary"onclick="exitToManager()"style="margin-top: var(--spacing-md);">Back to Character Manager</button>`,
          );
        } else {
          // Show remaining + reset timing to make the daily nature explicit.
          let resetText = '';
          if (qi.resetAt) {
            try {
              const resetDate = new Date(qi.resetAt);
              const now = new Date();
              const hoursUntil = Math.max(0, Math.ceil((resetDate - now) / (1000 * 60 * 60)));
              if (hoursUntil <= 1) resetText = ' (resets in ~1 hour)';
              else if (hoursUntil < 24) resetText = ' (resets in ~' + hoursUntil + ' hours)';
            } catch (_) {}
          }
          quotaLine.textContent = qi.remaining + ' character creation' + (qi.remaining === 1 ? '' : 's') + ' remaining today' + resetText;
          // Slow continuous blink
          quotaLine.classList.add('is-blinking');
        }
        
        // Insert at the top of options container
        optionsContainer.insertBefore(quotaLine, optionsContainer.firstChild);
      }
    }

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle
    await Utils.sleep(150);

    // In guided (co-create) mode, default keyboard focus to the ROLL button so
    // players can immediately press Enter to roll abilities, while still being
    // able to arrow between the selector and the roll button.
    try {
      const rollButton = document.querySelector(
        `.question-card[data-question-id="${question.id}"].ability-method-roll`,
      );
      if (
        rollButton &&
        typeof KeyboardNav !== 'undefined' &&
        typeof KeyboardNav.getActiveButtons === 'function'
      ) {
        const activeButtons = KeyboardNav.getActiveButtons();
        const rollIndex = activeButtons.indexOf(rollButton);
        if (rollIndex !== -1) {
          KeyboardNav.currentFocusIndex = rollIndex;
          KeyboardNav.updateFocus();
        }
      }
    } catch (e) {
      // Non-fatal: fall back to the default keyboard focus behavior
      console.error('Ability method keyboard focus override failed', e);
    }

    Utils.scrollToBottom(true);
  },

  async showListChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);

    // Check for recommendations
    const state = CharacterState.get();
    const recommendations = state.recommendations?.[question.id] || [];

    // Separate options into recommended and non-recommended
    const recommendedOptions = [];
    const otherOptions = [];

    variedOptions.forEach((opt, index) => {
      // Check if this option's value is in the recommendations list
      const isRecommended = recommendations.includes(opt.value);
      if (isRecommended) {
        recommendedOptions.push({ opt, originalIndex: index });
      } else {
        otherOptions.push({ opt, originalIndex: index });
      }
    });

    // Ensure recommended options appear in the SAME order as the narrator's
    // recommendation list, so the "RECOMMENDED" buttons match the bullet list
    // that was just narrated to the player.
    if (recommendations.length > 0 && recommendedOptions.length > 1) {
      const indexInRecommendations = (value) => {
        const idx = recommendations.indexOf(value);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };

      recommendedOptions.sort(
        (a, b) =>
          indexInRecommendations(a.opt.value) -
          indexInRecommendations(b.opt.value),
      );
    }

    // Reorder options: recommended first (in narrated order), then others
    const reorderedOptions = [...recommendedOptions, ...otherOptions];

    // Store the reordered mapping for handleAnswer to use
    if (!this._optionIndexMapping) this._optionIndexMapping = {};
    this._optionIndexMapping[question.id] = reorderedOptions.map(
      (item) => item.originalIndex,
    );

    // Build the HTML with recommendations first
    let optionsHTML = '';
    let displayIndex = 0;

    if (recommendedOptions.length > 0) {
      optionsHTML += '<div class="recommendations-header">RECOMMENDED</div>';
      optionsHTML += recommendedOptions
        .map(({ opt, originalIndex }) => {
          const currentIndex = displayIndex++;
          return `<button class="button-primary"onclick="App.handleListAnswer('${question.id}', ${currentIndex})">★\u00A0${opt.text}</button>`;
        })
        .join('');

      if (otherOptions.length > 0) {
        optionsHTML += '<hr class="recommendations-divider">';
      }
    }

    optionsHTML += otherOptions
      .map(({ opt, originalIndex }) => {
        const currentIndex = displayIndex++;
        return `<button class="button-primary"onclick="App.handleListAnswer('${question.id}', ${currentIndex})">${opt.text}</button>`;
      })
      .join('');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `<div class="question-card"data-question-id="${question.id}"><div class="options-container">${optionsHTML}</div></div>`,
    );

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showSuggestion(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Get AI suggestion if available
    const suggestion = question.getSuggestion(state);

    // Store recommendations in state for the next question
    if (!state.recommendations) {
      state.recommendations = {};
    }
    state.recommendations[question.next] = suggestion.suggestions;

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const suggestionEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(suggestionEl, suggestion.message);
    Utils.scrollToBottom(true);

    // Show suggested options
    const suggestedHTML = suggestion.suggestions
      .map((s) => {
        const data =
          DND_DATA.races.find((r) => r.id === s) ||
          DND_DATA.classes.find((c) => c.id === s);
        if (data) return `• ${data.name}`;
        return `• ${s}`;
      })
      .join('\n');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(suggestedHTML),
    );
    await Utils.sleep(100);
    Utils.scrollToBottom(true);

    const suggestedListEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    suggestedListEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    suggestedListEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showAbilities(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Helper to truncate option text
    const truncate = (text, maxLength) => {
      return text.length > maxLength
        ? text.substring(0, maxLength - 3) + '...'
        : text;
    };

    const options = question.options || [];
    const selectOptionsHTML = options
      .map(
        (opt, index) => `<option value="${opt.value}"${index===0?'selected':''}>${truncate(opt.text,45)}</option>`,
      )
      .join('');

    const listboxOptionsHTML = options
      .map(
        (opt, index) => `<button
class="ability-method-option selector-option${index===0?' is-selected':''}"
data-method="${opt.value}"
role="option"
aria-selected="${index === 0 ? 'true' : 'false'}"><span class="selector-option-label">${truncate(opt.text,45)}</span></button>`,
      )
      .join('');

    const initialMethod = options[0]?.value || 'standard';
    const initialLabel = truncate(
      options[0]?.text || 'Standard Array',
      45,
    );

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `<div class="question-card"data-question-id="${question.id}"><div class="options-container ability-method-container"><label class="settings-label ability-method-label">Ability generation method:</label><div class="ability-method-controls"><div class="ability-method-trigger-wrap selector-shell selector-shell--listbox"><button
class="button-primary ability-method-trigger selector-trigger"
id="ability-method-trigger"
type="button"
aria-haspopup="listbox"
aria-expanded="false"
aria-controls="ability-method-listbox"
data-selected-method="${initialMethod}"><span class="ability-method-trigger-label">${initialLabel}</span></button><div
id="ability-method-listbox"
class="ability-method-listbox selector-menu"
role="listbox"
aria-label="Ability generation method">${listboxOptionsHTML}</div></div><button class="button-primary ability-method-roll"onclick="App.handleAbilityFromSelect()">ROLL</button></div></div></div>`,
    );

    // Wire up animated listbox behavior for ability method selector
    const trigger = document.getElementById('ability-method-trigger');
    const listbox = document.getElementById('ability-method-listbox');
    if (trigger && listbox) {
      const optionsEls = Array.from(
        listbox.querySelectorAll('.ability-method-option'),
      );

      const setMethod = (method, label) => {
        trigger.setAttribute('data-selected-method', method);
        const labelEl = trigger.querySelector(
          '.ability-method-trigger-label',
        );
        if (labelEl) {
          labelEl.textContent = label;
        }

        optionsEls.forEach((opt) => {
          const isSelected = opt.getAttribute('data-method') === method;
          opt.classList.toggle('is-selected', isSelected);
          opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = listbox.classList.contains('is-open');
        if (!isOpen) {
          // Open and focus first option for immediate keyboard nav
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');

          // Position the listbox relative to the trigger so it behaves like
          // other selector menus: always above or below (preferring below),
          // at least as wide as the trigger, and constrained to the viewport
          // with internal scrolling if it can't fully fit on-screen.
          const shell =
            trigger.closest('.selector-shell') || trigger.parentElement;
          if (shell) {
            const shellRect = shell.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();

            // Measure menu size without affecting final animation. Temporarily
            // neutralize transforms so we get the full height instead of the
            // scaled (collapsed) height from CSS. Also clear any previous
            // inline sizing so each open starts from a clean baseline.
            const prevDisplay = listbox.style.display;
            const prevVisibility = listbox.style.visibility;
            const prevTransform = listbox.style.transform;

            listbox.style.maxHeight = '';
            listbox.style.overflowY = '';
            listbox.style.position = 'fixed';
            listbox.style.top = '0';
            listbox.style.left = '0';
            listbox.style.visibility = 'hidden';
            listbox.style.display = 'block';
            listbox.style.transform = 'none';

            const menuRect = listbox.getBoundingClientRect();
            let menuHeight = menuRect.height || 0;
            let menuWidth = menuRect.width || 0;

            // Ensure the listbox is at least as wide as the trigger. For small
            // triggers (like icons), we still respect the global min-width.
            const triggerWidth = triggerRect.width || 0;
            if (triggerWidth > 0 && menuWidth < triggerWidth) {
              listbox.style.minWidth = `${triggerWidth}px`;
              const remeasureRect = listbox.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            }

            listbox.style.display = prevDisplay;
            listbox.style.visibility = prevVisibility;
            listbox.style.transform = prevTransform;

            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const padding = 8; // breathing room from edges
            const gapY = 4; // small gap between trigger and menu when opening below

            // Treat the nearest terminal frame/container as the visual "viewport"
            // so the listbox never extends outside the green app frame.
            const host =
              trigger.closest('.terminal-frame, .terminal-container') ||
              document.documentElement;
            const hostRect = host.getBoundingClientRect();
            const hostTop = hostRect.top + padding;
            const hostBottom = hostRect.bottom - padding;

            // Space available above and below the trigger within the host.
            const spaceAbove = triggerRect.top - hostTop;
            const spaceBelow = hostBottom - triggerRect.bottom;

            const fitsBelow = spaceBelow >= menuHeight + gapY;
            const fitsAbove = spaceAbove >= menuHeight + gapY;

            // Choose direction: prefer below when possible, but fall back to
            // whichever side has room, similar to the shared selector menus.
            const triggerCenterY = triggerRect.top + triggerRect.height / 2;
            const inTopHalf = triggerCenterY < viewportHeight / 2;

            let openBelow;
            if (fitsBelow && fitsAbove) {
              openBelow = inTopHalf;
            } else if (fitsBelow) {
              openBelow = true;
            } else if (fitsAbove) {
              openBelow = false;
            } else {
              // Neither direction fits perfectly: use the side with more space.
              openBelow = spaceBelow >= spaceAbove;
            }

            // Position using a single top coordinate, clamped so the menu stays
            // fully inside the host. If there's not enough room for full height,
            // we'll cap height and enable internal scrolling.
            const maxTop = hostBottom - menuHeight;
            let topInViewport;

            if (openBelow) {
              topInViewport = triggerRect.bottom + gapY;
              if (topInViewport > maxTop) {
                topInViewport = Math.max(hostTop, maxTop);
              }
            } else {
              topInViewport = triggerRect.top - gapY - menuHeight;
              if (topInViewport < hostTop) {
                topInViewport = hostTop;
              }
            }

            // If the menu would extend past the host, cap its height so it scrolls
            // instead of being clipped by the terminal container.
            const availableHeight = hostBottom - topInViewport;
            if (menuHeight > availableHeight && availableHeight > 0) {
              listbox.style.maxHeight = `${availableHeight}px`;
              listbox.style.overflowY = 'auto';
            } else {
              listbox.style.maxHeight = '';
              listbox.style.overflowY = '';
            }

            // Horizontal alignment: start left-aligned, then if that would
            // overflow to the right, right-align to the trigger instead.
            const minLeft = padding;
            const maxLeft = Math.max(
              minLeft,
              viewportWidth - padding - menuWidth,
            );

            let targetLeft = triggerRect.left;
            const naturalRight = targetLeft + menuWidth;
            const viewportRightLimit = viewportWidth - padding;
            if (naturalRight > viewportRightLimit) {
              targetLeft = triggerRect.right - menuWidth;
            }

            if (targetLeft < minLeft) targetLeft = minLeft;
            if (targetLeft > maxLeft) targetLeft = maxLeft;

            // Use fixed positioning in viewport space so the listbox is
            // independent of scroll containers and always anchors to the
            // trigger's visual position.
            listbox.style.position = 'fixed';
            listbox.style.top = `${topInViewport}px`;
            listbox.style.left = `${targetLeft}px`;
            listbox.style.right = 'auto';
          }

          if (optionsEls.length) {
            optionsEls[0].focus();
          }
        } else {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      optionsEls.forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const method = opt.getAttribute('data-method') || 'standard';
          const label = (opt.textContent || '').trim();
          setMethod(method, label);
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', (e) => {
        if (!listbox.classList.contains('is-open')) return;
        if (trigger.contains(e.target) || listbox.contains(e.target)) return;
        listbox.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && listbox.classList.contains('is-open')) {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });

      // Keyboard navigation for ability method listbox
      const handleAbilityListboxKeydown = (e) => {
        const isOpen = listbox.classList.contains('is-open');

        const openAndFocus = (index) => {
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          if (optionsEls.length) {
            const clamped = Math.max(
              0,
              Math.min(optionsEls.length - 1, index),
            );
            optionsEls[clamped].focus();
          }
        };

        if (e.target === trigger) {
          if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowUp' && !isOpen) {
            e.preventDefault();
            openAndFocus(optionsEls.length - 1);
            return;
          }
        }

        if (!isOpen) return;

        if (e.key === 'Escape') {
          // Global ESC handler above will close and refocus trigger
          return;
        }

        if (!optionsEls.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIndex = optionsEls.indexOf(document.activeElement);
          let nextIndex = currentIndex;
          if (currentIndex === -1) {
            nextIndex = e.key === 'ArrowDown' ? 0 : optionsEls.length - 1;
          } else {
            nextIndex =
              e.key === 'ArrowDown'
                ? (currentIndex + 1) % optionsEls.length
                : (currentIndex - 1 + optionsEls.length) % optionsEls.length;
          }
          optionsEls[nextIndex].focus();
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          const activeOption = optionsEls.find(
            (opt) => opt === document.activeElement,
          );
          if (activeOption) {
            e.preventDefault();
            activeOption.click();
          }
        }
      };

      trigger.addEventListener('keydown', handleAbilityListboxKeydown);
      listbox.addEventListener('keydown', handleAbilityListboxKeydown);

      // Initialize selected state from initial method
      setMethod(initialMethod, initialLabel);
    }

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
    
    // Focus the roll button instead of the selector
    const rollButton = document.querySelector('.ability-method-roll');
    if (rollButton) {
      rollButton.focus();
    }
  },

  async showNameChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    // Show the question text with typewriter effect
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Show progressive thinking message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(nameThinkingEl);

    // Generate BOTH name suggestions and a backstory template using a single
    // backend AI call. This front-loads the heavy work so the later backstory
    // step can feel instant.
    let names = [];
    try {
      const summary = await AIService.generateCharacterSummary(state.character, {
        nameCount: 3,
      });
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        names = summary.names;
      }
      // Stash the backstory template (if provided) on the character so the
      // backstory step can simply substitute {{NAME}} later without another
      // API call.
      if (summary && summary.backstoryTemplate) {
        CharacterState.updateCharacter({
          backstoryTemplate: summary.backstoryTemplate,
        });
      }
      if (summary && summary.portraitGrantId) {
        CharacterState.updateCharacter({
          portraitGrantId: summary.portraitGrantId,
        });
      }
    } catch (e) {
      console.error('Name/backstory summary error; falling back to names-only flow:', e);
    }

    // Absolute fallback in case summary failed for any reason
    if (!names.length) {
      names = await AIService.generateNames(
        state.character.race,
        state.character.class,
        3,
      );
    }

    // Remove the thinking message
    this.stopProgressiveThinking();
    narratorPanel.lastElementChild.remove();

    // Build the name selection UI with proper styling matching other sections
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `<div class="question-card"data-question-id="${question.id}"><div class="options-container">${names.map((name,index)=>`<button class="button-primary" onclick="App.handleNameSelect(${index})">${name}</button>`,).join('\n              ')}</div><div class="name-input-container"><input
type="text"
class="input-field"
id="custom-name-input"
placeholder="Or enter your own name..."><button class="button-primary"onclick="App.handleCustomName()">SUBMIT</button></div></div>`,
    );

    // Store generated names for later reference
    this._generatedNames = names;

    // Wire up custom name behavior:
    // - When the input is focused, clear button keyboard focus so the
    //   user's attention is on their custom entry.
    // - Pressing Enter in the input submits the custom name.
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.addEventListener('focus', () => {
        if (typeof KeyboardNav !== 'undefined' && KeyboardNav.clearFocus) {
          KeyboardNav.clearFocus();
        }
      });

      customInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleCustomName();
        }
      });
    }

    // Activate keyboard navigation
    KeyboardNav.activate();

    // Wait for DOM to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showBackstory(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Show progressive thinking message for backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(backstoryThinkingEl);

    // Prefer using a cached backstory template (generated earlier during the
    // name step) so this feels instant and does not require another AI call.
    let backstory = state.character.backstory;
    const template = state.character.backstoryTemplate;
    const nameForTemplate = state.character.name || 'This character';

    if (!backstory && template && typeof template === 'string') {
      backstory = template
        .replace(/{{\s*NAME\s*}}/g, nameForTemplate)
        .replace(/{{\s*RACE\s*}}/g, state.character.race || 'adventurer')
        .replace(/{{\s*CLASS\s*}}/g, state.character.class || 'hero');
      CharacterState.updateCharacter({ backstory });
    }

    // Fallback: if we have no template or something went wrong, fall back to
    // the original behavior and call the dedicated backstory endpoint.
    if (!backstory) {
      backstory = await AIService.generateBackstory(state.character);
      CharacterState.updateCharacter({ backstory });
    }

    // Stop thinking and clear the element, then type out the backstory
    this.stopProgressiveThinking();
    backstoryThinkingEl.textContent = '';
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    backstoryThinkingEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showSpellSelection(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const classId = state.character.class;

    // Show narrator message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');

    let spells = null;

    if (question.mode === 'quick') {
      // Quick mode: auto-select spells
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      // Get auto-selected spells
      spells = SPELL_DATA.getQuickModeSpells(classId);

      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(classId);
        
        // Show what was selected
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        const spellSummary = `>Selected ${spells.cantrips.length}cantrip${spells.cantrips.length!==1?'s':''}and ${spells.firstLevel.length}1st level spell${spells.firstLevel.length!==1?'s':''}.>>Cantrips:${spells.cantrips.map(s=>s.name).join(', ')}>1st Level:${spells.firstLevel.map(s=>s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    } else {
      // Guided mode: suggest based on preferences
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      const preferences = {
        style: state.answers.spellStyle || 'offense',
        element: state.answers.spellElement || 'versatile',
      };

      spells = SPELL_DATA.getGuidedSpells(classId, preferences);

      if (spells) {
        // Show personalized recommendations
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        let flavorText = '';
        if (preferences.style === 'offense') {
          flavorText = "> Ah, a blaster. How... predictable. Here's your destruction kit:";
        } else if (preferences.style === 'defense') {
          flavorText = "> The cautious type, I see. Here are your survival tools:";
        } else if (preferences.style === 'control') {
          flavorText = "> A tactician. Interesting. Here's your battlefield control suite:";
        } else {
          flavorText = "> Utility over flash. Practical. Here's your toolkit:";
        }
        
        const spellSummary = `${flavorText}>>Cantrips:${spells.cantrips.map(s=>s.name).join(', ')}>1st Level:${spells.firstLevel.map(s=>s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    }

    // Save spells to character
    if (spells) {
      const config = SPELL_DATA.getSpellcastingConfig(classId);
      CharacterState.updateCharacter({
        spellcastingAbility: config.ability,
        cantrips: spells.cantrips,
        spellsKnown: spells.firstLevel,
        spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
        spellSlots: config.spellSlots,
      });
    }

    await Utils.sleep(1500);
    await this.showQuestion(question.next);
  },

  async showComplete(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // Use narrator-specific completion text
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const completionText = narrator.completeText || question.text;

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, completionText);
    Utils.scrollToBottom(true);

    // NOTE: AI portrait generation now starts after name selection (earlier in flow)
    // since we removed backstory from the prompt. This gives it more time to complete.
    
    // NOTE: We don't save here anymore - we wait for portrait to load first
    // This prevents creating duplicate characters in cloud storage

    // Check if user can create another character after this one.
    // We enforce the daily creation quota (reset daily) for both guest + logged-in.
    // remaining === 0 means exhausted, -1 means unlimited.
    const quotaExhausted =
      this._creationQuotaInfo &&
      this._creationQuotaInfo.remaining !== -1 &&
      this._creationQuotaInfo.remaining <= 0;
    const canCreateAnother = !quotaExhausted;

    // Show completion options
    const createAnotherBtn = canCreateAnother
      ? `<button class="button-primary"id="completion-new-btn"onclick="App.startNew()">&gt;\u00A0CREATE ANOTHER CHARACTER</button>`
      : '';
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `<div class="question-card mt-lg"data-question-id="${question.id}"><button class="button-primary completion-save-btn"id="completion-save-btn"onclick="App.saveAndExit()">&gt;\u00A0SAVE AND EXIT</button>${createAnotherBtn}</div>`,
    );
    Utils.scrollToBottom(true);

    // Activate keyboard navigation
    KeyboardNav.activate();
  },

  /**
   * Stop the portrait loading animation interval.
   */
  _stopPortraitLoadingAnimation() {
    if (this._portraitLoadingInterval) {
      clearInterval(this._portraitLoadingInterval);
      this._portraitLoadingInterval = null;
    }
    this._portraitElapsed = 0;
  },

  /**
   * Render the standard AI portrait loading state in the portrait panel.
   * Uses the glowing, fast-spinning cube plus animated dots matching
   * the manager view and shared PortraitUI helper.
   */
  _renderPortraitGeneratingLoader(portraitEl) {
    if (!portraitEl) return;

    // Stop any existing animation interval before starting a new one.
    this._stopPortraitLoadingAnimation();

    // Normalize the portrait container into a loading state so the cube + text
    // layout matches the shared portrait styles in `portraits.css`.
    // - Ensure the placeholder variant (16:9 flex box) is present so the cube
    //   stays centered and the 3D context is correct even after custom art
    //   has been rendered previously.
    // - Also add the loading variant, which loosens white-space/overflow and
    //   guarantees a minimum height for the spinner + status text.
    portraitEl.classList.add('ascii-portrait--placeholder');
    portraitEl.classList.add('ascii-portrait--loading');
    // Clear any custom inline sizing overrides from previous renders.
    portraitEl.style.fontSize = '';
    portraitEl.style.whiteSpace = '';
    portraitEl.style.textAlign = '';
    portraitEl.style.overflowX = '';
    portraitEl.style.overflowY = '';

    // Use standardized message matching manager view.
    const baseMessage = 'Generating character art';
    
    // Model-aware subtext: GPT Image 1 takes longer than DALL·E 3.
    let subtext = '(This usually takes 20–30 seconds)';
    try {
      if (
        window.PortraitUI &&
        typeof PortraitUI.getImageModelSubtext === 'function'
      ) {
        subtext = PortraitUI.getImageModelSubtext();
      } else {
        // Inline fallback if PortraitUI not available.
        let imageModel = 'dall-e-3';
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          imageModel = StorageService.getImageModel();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
          imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }
        if (imageModel === 'gpt-image-1') {
          subtext = '(This can take up to a minute)';
        } else if (imageModel === 'flux-1.1-pro') {
          subtext = '(Flux Pro – usually 10–20 seconds)';
        } else if (imageModel === 'flux-schnell') {
          subtext = '(Flux Schnell – usually 5–10 seconds)';
        }
      }
    } catch (e) {
      // Fall back to default subtext on any error.
    }

    // Initialize elapsed counter for dot animation.
    this._portraitElapsed = 0;

    // Update function that animates the dots (cycles 1→2→3).
    const updatePortraitLoading = () => {
      if (!portraitEl) return;
      const dotCount = (this._portraitElapsed % 3) + 1;

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
        // Fallback: update dot state manually if shared helper unavailable.
        // Check for the generating-specific class to know if loader is already rendered.
        let cubeEl = portraitEl.querySelector('.portrait-placeholder-cube--generating');
        let textEl = portraitEl.querySelector('.portrait-placeholder-text');
        if (!cubeEl) {
          // Loader not yet rendered - replace the placeholder with loader HTML
          portraitEl.innerHTML = `<div class="portrait-placeholder-content"><div class="portrait-placeholder-cube-container"><div class="portrait-placeholder-cube portrait-placeholder-cube--generating"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="portrait-placeholder-text"data-dots="${dotCount}"><span class="portrait-placeholder-message">${baseMessage}</span><span class="portrait-placeholder-dots"><span class="dot dot-1">.</span><span class="dot dot-2">.</span><span class="dot dot-3">.</span></span><div class="portrait-placeholder-subtext">${subtext}</div></div></div>`;
          textEl = portraitEl.querySelector('.portrait-placeholder-text');
        } else if (textEl) {
          // Loader already rendered - just update dot count
          textEl.setAttribute('data-dots', String(dotCount));
        }
      }

      this._portraitElapsed++;
    };

    // Render immediately, then start interval for animation.
    updatePortraitLoading();
    this._portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
  },

  // In guided (co-create) mode, automatically generate a custom AI portrait
  // once we have the essential character context (race, class, name).
  // Triggered after name selection since backstory is no longer used in prompts.
  // This runs in the background and doesn't block the conversational flow.
  async autoGenerateGuidedAIPortraitIfReady() {
    try {
      if (
        !window.CharacterState ||
        typeof CharacterState.get !== 'function' ||
        !window.AsciiArtService ||
        !CONFIG.ENABLE_AI
      ) {
        return;
      }

      const state = CharacterState.get() || {};
      const character = state.character || {};
      const answers = state.answers || {};
      const entryMode = answers['entry-mode'];

      // Only run this logic for guided (co-create) mode.
      if (entryMode !== 'guided') {
        return;
      }

      // Require the core fields that we include in portrait prompts.
      // Name is now the trigger point (backstory removed from prompts).
      // We also have race, class, background, and alignment at this point.
      const hasCoreFields =
        character.race &&
        character.class &&
        character.name;

      if (!hasCoreFields) {
        return;
      }

      // If we already have a custom AI portrait, don't regenerate.
      if (character.customPortraitAscii || (character.customPortraitCount || 0) > 0) {
        return;
      }

      // Mark that portrait generation is in progress (used by updateCharacterPanel)
      this._guidedPortraitGenerating = true;

      const portraitEl = document.getElementById('character-portrait');

      // Show a loading state in the portrait panel while the AI image is
      // being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(character, {
        creationGrantId: character && character.portraitGrantId,
      });

      if (result && result.asciiArt) {
        const currentCount = character.customPortraitCount || 0;

        // Get the current style theme for tagging
        let guidedStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            guidedStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
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

        const updatedMetadata =
          window.PortraitHistory && typeof PortraitHistory.addVersion === 'function'
            ? PortraitHistory.addVersion(
                character,
                result.asciiArt,
                result.imageUrl || null,
                {
                  source: 'guided-auto',
                  prompt:
                    (AIService.buildPortraitPrompt &&
                      AIService.buildPortraitPrompt(character)) ||
                    null,
                  style: guidedStyle,
                  model: generationModel,
                  quality: generationQuality,
                },
              )
            : character.portraitMetadata || {};

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
          // Grant was successfully redeemed; clear it so later regenerations
          // (Customize portrait) always count against custom image quota.
          portraitGrantId: null,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Guided-mode AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Guided Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers:${categories}.`;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a basic portrait to fall back to.
      await this._ensurePreGeneratedPortraitFallback(character);
    } finally {
      // Clear the generating flag so future re-renders work normally
      this._guidedPortraitGenerating = false;
      
      // Stop the animated dots interval.
      this._stopPortraitLoadingAnimation();
      
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  // Persist changes to shared storage only after a character has been saved once.
  // This keeps manager in sync for post-completion edits (rename, level, portrait, etc.)
  async persistIfAlreadySaved() {
    const state = CharacterState.get();
    const character = state.character;
    
    // If there's no ID yet, this character hasn't been saved to shared storage.
    if (!character || !character.id) {
      return;
    }
    
    try {
      await StorageService.saveCharacter(character);
    } catch (error) {
      console.error('Error persisting character changes:', error);
    }
  },

  async handleListAnswer(questionId, displayIndex) {
    // Check if this is a previous question being changed.
    // We consider any question card that is NOT the last one in the narrator
    // panel to be "previous", regardless of current state.answers contents.
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, displayIndex, true);
      return;
    }

    // Translate display index to original index using the mapping
    const originalIndex =
      this._optionIndexMapping?.[questionId]?.[displayIndex] ??
      displayIndex;

    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[originalIndex];

    // Mark the selected button using the DISPLAY index
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn) => {
      btn.classList.remove('is-selected', 'is-locked');
    });
    buttons.forEach((btn, idx) => {
      if (idx === displayIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
      
      // Apply background benefits if a background was selected
      if (question.saveTo === 'background') {
        const backgroundData = DND_DATA.backgrounds.find(b => b.id === option.value);
        if (backgroundData) {
          CharacterState.updateCharacter({
            skillProficiencies: backgroundData.skillProficiencies || [],
            toolProficiencies: backgroundData.toolProficiencies || [],
            equipment: backgroundData.equipment || [],
            backgroundFeature: backgroundData.feature || null,
            // Note: languages is a number (choices to make), not automatically assigned
            languageChoices: backgroundData.languages || 0,
          });
        }
      }
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.insertAdjacentHTML(
        'beforeend',
        Components.renderNarratorMessage(''),
      );
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAnswer(questionId, optionIndex) {
    // Check if this is a previous question being changed (see comment in
    // handleListAnswer for rationale).
    const narratorPanel = document.getElementById('narrator-panel');
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, optionIndex, false);
      return;
    }

    const state = CharacterState.get();
    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[optionIndex];

    // Special handling for entry mode selection
    if (questionId === 'entry-mode') {
      if (option.value === 'quick') {
        // Record the selected entry mode in state so downstream logic
        // (like updateCharacterPanel) can detect that we're in quick mode
        // before any character renders happen.
        state.answers[questionId] = option.value;
        await this.quickCreateCharacter();
        return;
      }
      // Guided mode just continues into the normal flow below.
    }

    // Mark the selected button
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn, idx) => {
      btn.classList.remove('is-selected', 'is-locked');
      if (idx === optionIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.innerHTML += Components.renderNarratorMessage('');
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAbilityMethod(method) {
    // Mark the selected button
    const buttons = document.querySelectorAll(
      '.question-card:last-child .button-primary',
    );
    buttons.forEach((btn) => {
      if (
        btn.textContent.includes(
          method === 'standard' ? 'Standard Array' : 'Roll 4d6',
        )
      ) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    const state = CharacterState.get();
    let classData = DND_DATA.classes.find(
      (c) => c.id === state.character.class,
    );

    // Guard against missing or invalid class data so the flow never stalls
    // on the ability generation step. If something went wrong earlier and we
    // don't have a valid class, fall back to a generic Fighter-like profile.
    if (!classData) {
      console.error(
        'handleAbilityMethod: missing class data for',
        state.character?.class,
      );
      classData = {
        id: 'fighter',
        name: 'Fighter (fallback)',
        hitDie: 10,
        primaryAbility: ['str'],
        savingThrows: ['str', 'con'],
        equipment: [],
      };
    }

    let abilities = {};

    if (method === 'standard') {
      // Standard array: let user assign them (for now, auto-assign based on class)
      const scores = [15, 14, 13, 12, 10, 8];
      const primary = classData.primaryAbility[0];

      // Simple auto-assignment based on class
      abilities = {
        str: primary === 'str' ? 15 : 10,
        dex: primary === 'dex' ? 15 : 12,
        con: 14,
        int: primary === 'int' ? 15 : 8,
        wis: primary === 'wis' ? 15 : 13,
        cha: primary === 'cha' ? 15 : 10,
      };
    } else {
      // Roll 4d6 drop lowest
      abilities = {
        str: this.rollAbility(),
        dex: this.rollAbility(),
        con: this.rollAbility(),
        int: this.rollAbility(),
        wis: this.rollAbility(),
        cha: this.rollAbility(),
      };
    }

    // Apply racial bonuses (with a safe fallback if race data is missing)
    const race =
      DND_DATA.races.find((r) => r.id === state.character.race) || {
        abilityBonuses: {},
      };
    Object.keys(race.abilityBonuses || {}).forEach((ability) => {
      const bonus = race.abilityBonuses[ability] || 0;
      abilities[ability] = (abilities[ability] || 0) + bonus;
    });

    // Infer a coarse armor loadout from class equipment
    // Infer a coarse armor loadout from class equipment. The helper lives
    // on KeyboardNav (where the armor helpers are defined), so delegate to it.
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      state.character.class,
    );

    // Calculate HP (level 1)
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = classData.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor,
    // delegating to the shared armor helper on KeyboardNav.
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      state.character.class,
      abilities,
      armorCategory,
      hasShield,
    );

    // Store both base (level 1) abilities and current abilities
    CharacterState.updateCharacter({
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
    });
    CharacterState.set({ abilityMethod: method });

    // Tailor narrator tone based on how sturdy this character looks at level 1
    let hpComment;
    if (hitPoints <= Math.max(4, Math.floor(classData.hitDie * 0.5))) {
      hpComment = 'Ouch. I hope you like making death saves.';
    } else if (hitPoints >= classData.hitDie + 2) {
      hpComment = 'All meat, no subtlety. The healer will be proud.';
    } else {
      hpComment = 'Respectable. You might even survive the tutorial.';
    }

    // Also make a quick remark about other standout abilities
    const abilityNames = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma',
    };

    const abilityEntries = Object.entries(abilities);
    const highest = abilityEntries.reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      abilityEntries[0],
    );
    const lowest = abilityEntries.reduce(
      (worst, current) => (current[1] < worst[1] ? current : worst),
      abilityEntries[0],
    );

    let abilityComment = '';
    if (highest && highest[1] >= 16) {
      abilityComment += `Your ${abilityNames[highest[0]]}is doing a lot of heavy lifting.`;
    }
    if (lowest && lowest[1] <= 8) {
      abilityComment += `Maybe don't advertise that ${abilityNames[lowest[0]]}score.`;
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `Your abilities have been determined.HP:${hitPoints}.${hpComment}${abilityComment}`,
    );
    Utils.scrollToBottom(true);

    await Utils.sleep(2000);
    // Decide next question dynamically:
    // - If class is a spellcaster, branch into spell selection
    //   (guided vs quick based on entry mode).
    // - Otherwise, continue to background selection.
    const latestState = CharacterState.get();
    const classId = latestState.character.class;
    let nextQuestionId = this.currentQuestion.next || 'background-choice';

    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(classId)) {
      const entryMode = latestState.answers['entry-mode'];
      if (entryMode === 'guided') {
        nextQuestionId = 'spell-style-intro';
      } else {
        nextQuestionId = 'spell-quick-mode';
      }
    } else {
      nextQuestionId = 'background-choice';
    }

    await this.showQuestion(nextQuestionId);
  },

  async handleAbilityFromSelect() {
    const trigger = document.getElementById('ability-method-trigger');
    const method =
      trigger?.getAttribute('data-selected-method') || 'standard';
    await this.handleAbilityMethod(method);
  },

  rollAbility() {
    const rolls = [
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
    ].sort((a, b) => b - a);

    // Drop lowest, sum the rest
    return rolls[0] + rolls[1] + rolls[2];
  },

  async handleNameSelect(nameIndex) {
    // Get the selected name from the generated names array
    const name = this._generatedNames[nameIndex];

    if (!name) {
      console.error('Name not found at index:', nameIndex);
      return;
    }

    // Find all buttons in the last question card
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');

    // Mark the selected button and lock others
    buttons.forEach((btn, index) => {
      // Skip the submit button (last button in the card)
      if (btn.textContent.includes('SUBMIT')) return;

      if (index === nameIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Disable and lock the custom name input
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-locked');
    }

    // Disable the custom name submit button
    const submitButton = questionCard.querySelector(
      '.name-input-container .button-primary',
    );
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('is-locked');
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}.Sure.Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async handleCustomName() {
    const customInput = document.getElementById('custom-name-input');
    const name = customInput.value.trim();

    if (!name) {
      // Optionally provide feedback to the user
      console.log('Custom name cannot be empty.');
      return;
    }

    // Disable all name buttons and the input field
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');
    buttons.forEach((btn) => {
      btn.classList.add('is-locked');
      btn.disabled = true;
    });

    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-selected'); // Mark custom input as selected
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}.Sure.Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async checkBackendStatus() {
    // Backend status indicator has been removed from the settings modal UI.
    // This method is kept as a no-op for backwards compatibility.
    return;
  },

  // Legacy settings helpers are now routed through the shared SettingsModal
  // so both builder + manager use a single implementation.
  async openSettings() {
    if (window.SettingsModal && typeof SettingsModal.open === 'function') {
      SettingsModal.open();
    }
  },

  closeSettings() {
    if (window.SettingsModal && typeof SettingsModal.close === 'function') {
      SettingsModal.close();
    }
  },

  saveSettings() {
    if (window.SettingsModal && typeof SettingsModal.save === 'function') {
      SettingsModal.save();
    }
  },

  // Build the inner HTML for the portrait history modal body. This is shared
  // between the initial open and any in-place "reload" after a delete.
  _buildPortraitHistoryBody(normalized) {
    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];
    const hasVersions = !!normalized.hasVersions;
    const hasCustomPortraitWithoutHistory =
      !!normalized.hasCustomPortraitWithoutHistory;

    const listHtml = hasVersions
      ? versions
          .map((v) => {
            const isActive = metadata.activeVersionId === v.id;
            const createdLabel = v.createdAt
              ? new Date(v.createdAt).toLocaleString()
              : '';
            // Use only the generation date/time as the label for each version
            const title = createdLabel || 'Unknown time';
            const infoText = '';

            const hasImage = !!v.url;
            const hasPrompt = !!v.prompt;
            const thumbHtml = `<div class="card-thumbnail"><div class="ascii-portrait portrait-history-preview"data-version-id="${v.id}"></div>${hasImage?`<img src="${v.url}" alt="${title}" class="portrait-history-image is-hidden" data-version-id="${v.id}">`:''}</div>`;

            // Overflow menu for per-version actions (View, Prompt, Delete)
            const actionItems = [];

            if (hasImage) {
              actionItems.push(`<button
class="selector-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); App.togglePortraitHistoryView('${v.id}')"
data-toggle-version-id="${v.id}"><span class="selector-option-icon">◉</span><span class="selector-option-label">View original</span></button>`);
            }

            // Always show Image Info - displays date, style, model, and prompt (if available)
            actionItems.push(`<button
class="selector-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); App.viewPortraitImageInfo('${v.id}')"
title="View image generation details"><span class="selector-option-icon">ℹ︎</span><span class="selector-option-label">Image info</span></button>`);

            actionItems.push(`<button
class="selector-option portrait-history-delete-option"
type="button"
role="menuitem"
onclick="event.stopPropagation(); App.deletePortraitVersion('${v.id}')"
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

            return `<div class="character-card portrait-history-card${isActive?' is-selected':''}" data-version-id="${v.id}" onclick="App.selectPortraitHistoryCard('${v.id}')">${thumbHtml}<div class="card-details portrait-history-details"><div class="portrait-history-meta"><div class="card-name">${title}</div><div class="card-info">${infoText||'&nbsp;'}</div></div>${actionsMenu}</div></div>`;
          })
          .join('')
      : hasCustomPortraitWithoutHistory
        ? `<div class="terminal-text-small terminal-text-dim portrait-history-callout"><p><strong>No portrait history yet.</strong></p><p>This character's portrait was created before the history feature was added.</p><p>Generate a new custom AI portrait to:</p><ul class="portrait-history-callout-list"><li>Save your current portrait as Version 1</li><li>Add the new portrait as Version 2</li><li>Enable portrait version switching</li></ul></div>`
        : `<p class="terminal-text-small terminal-text-dim portrait-history-callout">No saved portraits yet.<br><br>Generate a custom AI portrait to start building a history.</p>`;

    return `<p class="terminal-text-small terminal-text-dim">View previous custom AI portraits for this character.Choose one to make it active,or delete versions you no longer need.</p><div class="portrait-history-card-row${versions.length===1?' is-single':''}">${listHtml}</div>`;
  },

  // Smoothly animate a modal's content height when its body is "reloaded"
  // (e.g., after deleting a portrait history entry). This uses a simple FLIP
  // pattern: measure -> update -> animate height from old to new.
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

  openPortraitHistory() {
    const state = CharacterState.get();
    const character = state.character || {};
    // Normalize portrait metadata + versions using the shared helper so the
    // builder and manager stay in sync.
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

    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];

    if (document.getElementById('portraitHistoryModal')) {
      return;
    }

    const bodyInnerHtml = this._buildPortraitHistoryBody(normalized);

    const modalHTML = `<div id="portraitHistoryModal"class="modal show"onclick="App.closePortraitHistory()"><div class="modal-content portrait-history-modal"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Portrait History</h2><button class="modal-close"onclick="App.closePortraitHistory()">&times;</button></div><div class="modal-body">${bodyInnerHtml}</div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="App.closePortraitHistory()">CANCEL</button><button class="terminal-btn terminal-btn-primary"onclick="App.confirmPortraitHistorySelection()">USE SELECTED</button></div></div></div>`;

    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Populate ASCII previews (for versions without an image URL) as plain
    // text, cropped to the same thumbnail framing as the main character cards.
    // Shared helper batches this work across animation frames.
    if (
      Array.isArray(versions) &&
      versions.length > 0 &&
      window.PortraitHistory &&
      typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
    ) {
      PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
        this.cropAsciiForThumbnail(ascii),
      );
    }

    // Initialize keyboard-style focus on the currently active portrait card,
    // falling back to the first card if no active version is set.
    const cards = this.getPortraitHistoryCards();
    if (cards.length > 0) {
      let initialIndex = 0;
      if (metadata.activeVersionId) {
        const matchIndex = cards.findIndex(
          (card) =>
            card.getAttribute('data-version-id') === metadata.activeVersionId,
        );
        if (matchIndex >= 0) {
          initialIndex = matchIndex;
        }
      }

      this._portraitHistoryFocusIndex = initialIndex;
      this.updatePortraitHistoryFocus();
    }

    // ESC / arrow keys / Enter inside the history modal
    this._portraitHistoryEscHandler = (e) => {
      if (e.key === 'Escape') this.closePortraitHistory();
    };
    this._portraitHistoryKeyHandler = (e) => {
      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmPortraitHistorySelection();
      }
    };

    document.addEventListener('keydown', this._portraitHistoryEscHandler);
    document.addEventListener('keydown', this._portraitHistoryKeyHandler);
  },

  closePortraitHistory() {
    const modal = document.getElementById('portraitHistoryModal');
    if (!modal) {
      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }

    if (this._portraitHistoryEscHandler) {
      document.removeEventListener('keydown', this._portraitHistoryEscHandler);
      this._portraitHistoryEscHandler = null;
    }
    if (this._portraitHistoryKeyHandler) {
      document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
      this._portraitHistoryKeyHandler = null;
    }
    this._portraitHistoryFocusIndex = 0;
  },

  getPortraitHistoryCards() {
    return Array.from(
      document.querySelectorAll('#portraitHistoryModal .character-card'),
    );
  },

  updatePortraitHistoryFocus() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;

    cards.forEach((card, i) => {
      const isFocused = i === index;
      card.classList.toggle('is-keyboard-focused', isFocused);
      card.classList.toggle('is-selected', isFocused);
    });
  },

  movePortraitHistoryFocus(delta) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const current =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const next = Math.max(0, Math.min(cards.length - 1, current + delta));
    this._portraitHistoryFocusIndex = next;
    this.updatePortraitHistoryFocus();
  },

  selectPortraitHistoryCard(versionId) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    let targetIndex = 0;
    cards.forEach((card, i) => {
      const matches = card.getAttribute('data-version-id') === versionId;
      if (matches) {
        targetIndex = i;
      }
    });

    this._portraitHistoryFocusIndex = targetIndex;
    this.updatePortraitHistoryFocus();
  },

  togglePortraitHistoryView(versionId) {
    const asciiEl = document.querySelector(
      `.portrait-history-preview.ascii-portrait[data-version-id="${versionId}"]`,
    );
    const imgEl = document.querySelector(
      `.portrait-history-image[data-version-id="${versionId}"]`,
    );
    const btn = document.querySelector(
      `.portrait-history-actions button[data-toggle-version-id="${versionId}"]`,
    );

    if (!imgEl || !asciiEl || !btn) return;

    const showingAscii = imgEl.classList.contains('is-hidden');

    if (showingAscii) {
      // Switch to original image
      asciiEl.classList.add('is-hidden');
      imgEl.classList.remove('is-hidden');
      btn.textContent = 'View ASCII';
    } else {
      // Switch back to ASCII art
      imgEl.classList.add('is-hidden');
      asciiEl.classList.remove('is-hidden');
      btn.textContent = 'View Original';
    }
  },

  cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
    // Split into lines
    const lines = asciiArt.split('\n');

    // VERTICAL: Crop from bottom only (keep top pinned for faces/heads)
    const totalLines = lines.length;
    const startLine = 0;
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

  async confirmPortraitHistorySelection() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) {
      this.closePortraitHistory();
      return;
    }

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const card = cards[index];
    if (!card) {
      this.closePortraitHistory();
      return;
    }

    const versionId = card.getAttribute('data-version-id');
    if (!versionId) {
      this.closePortraitHistory();
      return;
    }

    // Show a lightweight loading state on the primary button while we apply
    // the selected portrait. The modal will close once the operation finishes.
    const modal = document.getElementById('portraitHistoryModal');
    const useBtn =
      modal && modal.querySelector('.modal-footer .terminal-btn-primary');
    const originalLabel = useBtn ? useBtn.textContent : null;
    if (useBtn) {
      useBtn.disabled = true;
      useBtn.textContent = 'Applying...';
    }

    try {
      await this.usePortraitVersion(versionId);
    } catch (error) {
      console.error(
        'App.confirmPortraitHistorySelection: failed to apply portrait version',
        error,
      );
      if (useBtn) {
        useBtn.disabled = false;
        useBtn.textContent = originalLabel || 'USE SELECTED';
      }
      this.showSystemMessage(
        'Failed to switch portrait. Please try again in a moment.',
      );
    }
  },

  async usePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      this.showSystemMessage('Portrait version not found.');
      return;
    }

    const updatedMetadata = {
      ...metadata,
      activeVersionId: version.id,
    };

    CharacterState.updateCharacter({
      originalPortraitUrl:
        version.url || character.originalPortraitUrl || null,
      customPortraitAscii: version.ascii || character.customPortraitAscii || '',
      portraitMetadata: updatedMetadata,
    });

    // Persist in the background if the character is already saved to shared storage.
    await this.persistIfAlreadySaved();

    // Force an immediate refresh of the in-builder character sheet so the new
    // portrait is visible even if any listeners were missed.
    try {
      const latestState = CharacterState.get();
      if (
        latestState &&
        latestState.character &&
        typeof this.updateCharacterPanel === 'function'
      ) {
        await this.updateCharacterPanel(latestState.character);
      }
    } catch (e) {
      console.error(
        'App.usePortraitVersion: failed to refresh character panel after version switch',
        e,
      );
    }

    this.closePortraitHistory();
  },

  async deletePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    if (!versions.length) {
      this.closePortraitHistory();
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

    // If this is the only portrait, show "create new" prompt instead of delete confirmation
    if (versions.length === 1) {
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
          if (Array.isArray(versions) && versions.length > 0 &&
              window.PortraitHistory &&
              typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
            PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
              this.cropAsciiForThumbnail(ascii),
            );
          }

          const cards = this.getPortraitHistoryCards();
          if (cards.length > 0) {
            this._portraitHistoryFocusIndex = 0;
            this.updatePortraitHistoryFocus();
          }
        };
      }

      if (createNewBtn) {
        createNewBtn.onclick = () => {
          this.closePortraitHistory();
          this.generateCustomAIPortrait();
        };
      }

      return;
    }

    // Build the confirmation view using standard modal structure
    const confirmationBodyHtml = `<p class="terminal-text">Delete this saved portrait version?This cannot be undone.</p>`;

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
      if (
        Array.isArray(versions) &&
        versions.length > 0 &&
        window.PortraitHistory &&
        typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
      ) {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
    };

    if (cancelBtn) {
      cancelBtn.onclick = restoreOriginal;
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
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
          } else {
            // No remaining custom versions – clear custom portrait so we fall back to template/pre-generated art
            updates.originalPortraitUrl = null;
            updates.customPortraitAscii = '';
          }
        }

        CharacterState.updateCharacter(updates);
        await this.persistIfAlreadySaved();

        // If no remaining versions, close the modal entirely
        if (!remaining.length) {
          this.closePortraitHistory();
          return;
        }

        // Rebuild normalized metadata from the latest state
        const latestState = CharacterState.get();
        const latestCharacter = latestState.character || {};
        const latestNormalized =
          window.PortraitHistory &&
          typeof PortraitHistory.normalizeForDisplay === 'function'
            ? PortraitHistory.normalizeForDisplay(latestCharacter)
            : (() => {
                const fallbackMetadata = latestCharacter.portraitMetadata || {};
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

        // Transform back to history view with updated content
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = originalTitle;
          modalBody.innerHTML = this._buildPortraitHistoryBody(latestNormalized);
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-run ASCII thumbnail population & focus wiring for the updated list
        const nextVersions = Array.isArray(latestNormalized.versions)
          ? latestNormalized.versions
          : [];
        if (
          Array.isArray(nextVersions) &&
          nextVersions.length > 0 &&
          window.PortraitHistory &&
          typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
        ) {
          PortraitHistory.batchPopulateAsciiPreviews(nextVersions, (ascii) =>
            this.cropAsciiForThumbnail(ascii),
          );
        }

        const cards = this.getPortraitHistoryCards();
        if (cards.length > 0) {
          this._portraitHistoryFocusIndex = 0;
          this.updatePortraitHistoryFocus();
        }
      };
    }
  },

  viewPortraitImageInfo(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      this.showToast('No info available for this portrait.');
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

    const infoHeaderHtml = `<h2 class="modal-title">Image Info</h2><button class="modal-close"onclick="App.closePortraitHistory()">&times;</button>`;

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
      if (Array.isArray(versions) && versions.length > 0 &&
          window.PortraitHistory &&
          typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
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
          this.showToast('Prompt copied.');
        } catch (error) {
          console.error('Failed to copy portrait prompt:', error);
          this.showToast('Could not copy prompt.', 5000);
        }
      };
    }
  },

  // Legacy alias for backwards compatibility
  viewPortraitPrompt(versionId) {
    return this.viewPortraitImageInfo(versionId);
  },

  async generateCustomAIPortrait() {
    const state = CharacterState.get();
    const character = state.character;

    // Block custom art generation for sample (demo) characters
    if (window.DemoCharacters && DemoCharacters.isDemo(character)) {
      this.showSystemMessage(
        'Custom art generation is not available for sample characters. ' +
        'Create your own character to generate custom portraits!'
      );
      return;
    }

    // Note: Daily portrait limits are now enforced by the backend.
    // Demo users get 5/day, logged-in users get 20/day.
    // The backend returns appropriate error messages when limits are hit.

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select both a race and a class before generating a custom portrait.',
      );
      return;
    }

    // Check if backend is available (API key check now handled server-side)
    try {
      const statusCheck = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`);
      if (!statusCheck.ok) {
      this.showSystemMessage(
          'Backend server is not available. Make sure the backend is running on port 8000.',
        );
        return;
      }
      const statusData = await statusCheck.json();
      if (!statusData.available) {
        this.showSystemMessage(
          'AI features are not available. The backend server is not configured.',
        );
        return;
      }
    } catch (error) {
      this.showSystemMessage(
        'Cannot connect to backend server. Make sure it is running on http://localhost:8000',
      );
      return;
    }

    // Show prompt modal
    this.openPromptModal(character);
  },

  /**
   * Ensure we have at least a basic ASCII fallback portrait for the given
   * character. Used when custom AI portrait generation fails (rate limits,
   * backend errors, etc.) so we don't leave the frame empty.
   *
   * Important: this intentionally does NOT load any pre-generated portrait
   * assets (ASCII or images). It only uses the simple template portrait.
   */
  async _ensurePreGeneratedPortraitFallback(character, options = {}) {
    const force = !!(options && options.force);

    try {
      if (!window.AsciiArtService || !character || !character.race) {
        return;
      }

      const currentState = CharacterState.get();
      const existing = currentState && currentState.character ? currentState.character : {};

      if (
        !force &&
        (existing.customPortraitAscii ||
          (existing.portrait && (existing.portrait.ascii || existing.portrait.url)) ||
          existing.asciiPortrait)
      ) {
        // We already have some kind of portrait attached; don't overwrite it.
        return;
      }

      // Use the simple template portrait only (no pre-generated file loads).
      const fallbackArt = AsciiArtService.getFullPortrait
        ? AsciiArtService.getFullPortrait(character)
        : '';

      // In guided/quick mode, updateCharacterPanel only shows customPortraitAscii,
      // not asciiPortrait. So we also set customPortraitAscii here to ensure the
      // fallback portrait actually displays in those modes.
      if (fallbackArt && window.CharacterState) {
        CharacterState.updateCharacter({
          customPortraitAscii: fallbackArt,
          // Explicitly clear any existing original image URL so pre-generated
          // images (or stale URLs) cannot appear as a fallback.
          originalPortraitUrl: null,
          portrait: {
            ...(existing.portrait || {}),
            url: null,
          },
        });
      }

      // Clear last-portrait cache so the pre-generated art will animate in.
      this._lastPortraitArt = null;

      const latest = CharacterState.get().character;
      await this.updateCharacterPanel(latest);
    } catch (fallbackError) {
      console.error('Failed to apply fallback portrait:', fallbackError);
    }
  },

  async openPromptModal(character) {
    // Show only the character description to the user (not the rendering instructions)
    const defaultPrompt = AIService.buildCharacterDescription
      ? AIService.buildCharacterDescription(character)
      : ''; // backwards compat if renamed
    
    // Get active style from portrait version or user's saved preference
    let activeStyle = null;
    try {
      // Check if character has an active portrait version with a style
      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      if (versions.length) {
        const activeId = metadata.activeVersionId;
        let active =
          (activeId && versions.find((v) => v && v.id === activeId)) ||
          versions[versions.length - 1];
        if (active && active.style) {
          activeStyle = active.style;
        }
      }
      // Fall back to user's saved preference
      if (!activeStyle && window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
        activeStyle = StorageService.getPortraitPromptTheme();
      }
    } catch (e) {
      // Non-fatal
    }

    const modalHTML = `<div id="promptModal"class="modal show"onclick="App.closePromptModal(false)"><div class="modal-content portrait-customize-modal"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Customize portrait</h2><button class="modal-close"onclick="App.closePromptModal(false)">&times;</button></div><div class="modal-body"><div class="portrait-style-row"><div class="portrait-style-label">Style</div><div class="selector-shell selector-shell--listbox portrait-style-selector"id="builderPortraitStyleShell"><button
type="button"
class="terminal-btn selector-trigger"
id="builderPortraitStyleTrigger"
aria-haspopup="listbox"
aria-expanded="false"
onclick="CharacterSheet.toggleSelectorMenu(this)"><span class="selector-trigger-label"id="builderPortraitStyleLabel">Cinematic inks</span></button><div class="selector-menu portrait-style-menu"id="builderPortraitStyleMenu"role="listbox"aria-label="Portrait style"aria-hidden="true"><!--Options populated by JS--></div></div></div><div class="image-quota-info is-blinking"id="builderImageQuotaLine">Checking image quota…</div><textarea
class="terminal-textarea portrait-prompt-textarea"
id="custom-prompt"
placeholder="Enter custom description...">${defaultPrompt}</textarea></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="App.surpriseMePortrait()">SURPRISE ME</button><button class="terminal-btn terminal-btn-primary"onclick="App.confirmPromptModal()">GENERATE PORTRAIT</button></div></div></div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Populate the style dropdown (await to ensure API sync completes first)
    // This ensures global/shared styles are loaded for all authenticated users
    await populateBuilderPortraitStyleDropdown(activeStyle);

    const modal = document.getElementById('promptModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // Populate the quota line (and keep it updated while the modal is open).
    try {
      const quotaLine = document.getElementById('builderImageQuotaLine');
      const updateQuotaLine = (detail) => {
        const el = document.getElementById('builderImageQuotaLine');
        if (!el) return;
        const remaining = detail && typeof detail.remaining === 'number' ? detail.remaining : null;
        const limit = detail && typeof detail.limit === 'number' ? detail.limit : null;
        const resetAt = detail && detail.resetAt ? detail.resetAt : null;

        let resetText = '';
        if (resetAt) {
          try {
            const resetDate = new Date(resetAt);
            const now = new Date();
            const hoursUntil = Math.max(0, Math.ceil((resetDate - now) / (1000 * 60 * 60)));
            if (hoursUntil <= 1) resetText = ' (resets in ~1 hour)';
            else if (hoursUntil < 24) resetText = ' (resets in ~' + hoursUntil + ' hours)';
          } catch (_) {}
        }

        // Find and update Generate button state based on quota
        const generateBtn = document.querySelector('#promptModal .terminal-btn-primary');
        const surpriseBtn = document.querySelector('#promptModal .terminal-btn:not(.terminal-btn-primary)');

        if (remaining === -1) {
          el.textContent = 'Image quota: unlimited (admin/dev)';
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.title = '';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = false;
            surpriseBtn.title = '';
          }
          return;
        }

        if (remaining === 0 && limit != null) {
          el.textContent = 'Custom portraits left today: 0/' + limit + resetText;
          if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.title = 'Daily custom portrait limit reached';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = true;
            surpriseBtn.title = 'Daily custom portrait limit reached';
          }
          return;
        }

        if (remaining != null && limit != null) {
          el.textContent = 'Custom portraits left today: ' + remaining + '/' + limit + resetText;
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.title = '';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = false;
            surpriseBtn.title = '';
          }
          return;
        }

        el.textContent = 'Image quota: unavailable';
      };

      // Store handler so we can remove it on close.
      this._promptModalQuotaHandler = (e) => updateQuotaLine(e && e.detail);
      window.addEventListener('danddy:imageQuotaUpdate', this._promptModalQuotaHandler);

      // Initial fetch for current quota status.
      if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
        const quota = await AIService.getImageQuotaStatus();
        if (quotaLine && quota) {
          updateQuotaLine({
            limit: quota.limit,
            remaining: quota.remaining,
            resetAt: quota.resetAt,
          });
        }
      }
    } catch (e) {
      // Non-fatal
    }

    // ESC key to close
    this._promptModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closePromptModal(false);
    };
    document.addEventListener('keydown', this._promptModalEscHandler);
  },

  closePromptModal(regenerate = false) {
    // Close the style menu if open (using standard selector toggle)
    const trigger = document.getElementById('builderPortraitStyleTrigger');
    if (trigger && trigger.classList.contains('is-open') && window.CharacterSheet) {
      CharacterSheet.toggleSelectorMenu(trigger);
    }
    
    const modal = document.getElementById('promptModal');
    if (!modal) {
      // Reset style state even if modal is gone
      currentBuilderPortraitStyle = null;
      return;
    }

    // If the modal is already in the process of closing, don't re-run animation.
    if (modal.classList.contains('closing')) return;

    modal.classList.add('closing');

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      // Remove the modal from the DOM after the close animation completes.
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      // Remove ESC key listener
      if (this._promptModalEscHandler) {
        document.removeEventListener('keydown', this._promptModalEscHandler);
        this._promptModalEscHandler = null;
      }

      // Remove quota listener
      if (this._promptModalQuotaHandler) {
        window.removeEventListener('danddy:imageQuotaUpdate', this._promptModalQuotaHandler);
        this._promptModalQuotaHandler = null;
      }
      
      // Reset the style selection state
      currentBuilderPortraitStyle = null;

      if (regenerate) {
        // Trigger portrait regeneration if confirmed
        const state = CharacterState.get();
        this.updateCharacterPanel(state.character);
      }
    };

    // If we have a modal-content element, wait for the close animation to finish.
    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      // Fallback: no animation support, just close immediately.
      handleClose();
    }
  },

  async confirmPromptModal() {
    const customPromptInput = document.getElementById('custom-prompt');
    const customPrompt = customPromptInput.value.trim();
    
    // Capture the selected style before closing the modal (which resets it)
    const selectedStyle = currentBuilderPortraitStyle;

    if (!customPrompt) {
      this.showSystemMessage('Portrait prompt cannot be empty.');
      return;
    }

    this.closePromptModal(false); // Close modal without regenerating yet

    const portraitEl = document.getElementById('character-portrait');
    const originalPortraitEl = document.getElementById('original-portrait');

    // If the user prefers original images, temporarily switch the visible
    // frame from original → ASCII so they see the cube loader + status while
    // the new portrait is being generated. The shared sheet will re-read the
    // global preference on re-render and switch back to original afterward.
    if (portraitEl && originalPortraitEl) {
      const container = portraitEl.closest('.portrait-container');
      const toggleBtn = document.getElementById('toggle-portrait-btn');

      let portraitViewMode = 'original';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (
          typeof CONFIG !== 'undefined' &&
          CONFIG.DEFAULT_PORTRAIT_VIEW_MODE
        ) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal: keep default
      }

      const isAsciiHidden = portraitEl.classList.contains('is-hidden');
      const isOriginalVisible = !originalPortraitEl.classList.contains(
        'is-hidden',
      );
      const isContainerOriginal =
        !!container &&
        container.classList.contains('portrait-container--original-mode');

      if (
        portraitViewMode === 'original' &&
        isAsciiHidden &&
        isOriginalVisible &&
        isContainerOriginal
      ) {
        // Temporarily switch the DOM to ASCII view so the loader is visible.
        portraitEl.classList.remove('is-hidden');
        originalPortraitEl.classList.add('is-hidden');
        if (container) {
          container.classList.remove('portrait-container--original-mode');
        }

        // Update the toggle label to reflect that ASCII is currently shown.
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

    if (portraitEl) {
      // While generating, scroll the character sheet back to the top so the
      // user immediately sees the portrait frame and loading status message.
      const characterPanel = document.getElementById('character-panel');
      if (characterPanel) {
        characterPanel.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }

      // Show the standard loading state with glowing, spinning cube and unified text.
      this._renderPortraitGeneratingLoader(portraitEl);
    }

    try {
      // Add rendering instructions to the user's character description
      // (hidden system-level guidance for the image model)
      // Use shared pose + camera data from PortraitPoseData module
      const character = CharacterState.get().character || {};
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
        // Use the style selected from the modal dropdown
        renderingInstructions =
          window.PortraitPrompt.buildCustomPortraitInstructions({
            posePrompt,
            cameraPrompt,
            themeId: selectedStyle,
          });
      } else {
        // Fallback if PortraitPrompt is not loaded for some reason.
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
      
      // Generate custom portrait with full prompt (including hidden rendering instructions)
      const result =
        await AsciiArtService.generateCustomAIPortraitWithPrompt(
          fullPrompt,
        );

      // Store both the original image URL and custom ASCII art in character state
      // Also increment the custom portrait counter and append to portrait history
      const current = CharacterState.get().character;
      const currentCount = current.customPortraitCount || 0;

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

      const updatedMetadata = window.PortraitHistory
        ? window.PortraitHistory.addVersion(
            current,
            result.asciiArt,
            result.imageUrl,
            {
              source: 'custom-ai',
              prompt: fullPrompt,
              style: selectedStyle,
              model: generationModel,
              quality: generationQuality,
            },
          )
        : current.portraitMetadata || {};

      // Respect the player's portrait view preference:
      // - If they prefer original images, keep that mode.
      // - If they prefer ASCII, continue to show ASCII first.
      // We do not forcibly flip the global portrait view mode here.

      CharacterState.updateCharacter({
        originalPortraitUrl: result.imageUrl,
        customPortraitAscii: result.asciiArt,
        customPortraitCount: currentCount + 1,
        portraitMetadata: updatedMetadata,
      });

      if (portraitEl) {
        // Stop the animated dots interval and restore portrait font size back
        // to ASCII default; the sheet will re-render for the newly generated art.
        this._stopPortraitLoadingAnimation();
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }

      // Update the last portrait art to trigger animation
      this._lastPortraitArt = null;

      // Re-render to show the toggle button and trigger animation
      const state = CharacterState.get();
      await this.updateCharacterPanel(state.character);
    } catch (error) {
      console.error('Error generating custom AI portrait with prompt:', error);

      // Check error type and show appropriate message
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Custom Prompt Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers:${categories}.`;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Restore portrait font sizing and swap back to a safe fallback portrait.
      const state = CharacterState.get();
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove(
          'ascii-portrait--loading',
          'ascii-portrait--placeholder',
        );
      }

      // If we already have some portrait art, just re-render the sheet;
      // otherwise, apply a basic fallback portrait now.
      await this._ensurePreGeneratedPortraitFallback(state.character, {
        force: !(
          state.character &&
          (state.character.customPortraitAscii ||
            state.character.asciiPortrait ||
            (state.character.portrait &&
              (state.character.portrait.ascii || state.character.portrait.url)))
        ),
      });
    }
  },

  // "Surprise Me" - generate a fresh randomized prompt and immediately generate portrait
  async surpriseMePortrait() {
    const state = CharacterState.get();
    const character = state && state.character ? state.character : {};

    if (!character.race || !character.class) {
      this.showSystemMessage('Select a race and class first.');
      return;
    }

    // Build a fresh randomized character description for the user to edit.
    // NOTE: Use buildCharacterDescription (not buildPortraitPrompt) so that
    // rendering instructions (Pose/Camera/STYLE/Scene) are only added once
    // by confirmPromptModal, avoiding duplication in the final prompt.
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

    // Update the prompt input field so user can see what was generated
    const promptInput = document.getElementById('custom-prompt');
    if (promptInput) {
      promptInput.value = templatePrompt;
    }

    // Immediately trigger generation with the new prompt
    await this.confirmPromptModal();
  },

  togglePortraitView() {
    const asciiPortrait = document.getElementById('character-portrait');
    const originalPortrait = document.getElementById('original-portrait');
    const toggleBtn = document.getElementById('toggle-portrait-btn');
    const container = asciiPortrait
      ? asciiPortrait.closest('.portrait-container')
      : null;

    if (!asciiPortrait || !originalPortrait || !toggleBtn) return;

    // Use the shared "is-hidden" class to determine visibility so we stay
    // consistent with the manager + shared character sheet markup. Relying on
    // inline style.display can get out of sync with the initial render, which
    // applies visibility purely via classes.
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
  },

  /**
   * (Deprecated) Kept for backwards compatibility. The shared character sheet
   * now applies the default portrait view (ASCII vs Original) during initial
   * render based on StorageService.getPortraitViewMode(), so this helper is
   * no longer needed. It is intentionally a no-op.
   */
  _applyPreferredPortraitViewBuilder(character) {
    try {
      const asciiPortrait = document.getElementById('character-portrait');
      const originalPortrait = document.getElementById('original-portrait');
      if (!asciiPortrait || !originalPortrait) return;

      const container = asciiPortrait.closest('.portrait-container');

      // Respect global preference (shared with manager).
      let portraitViewMode = 'original';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal
      }

      // Only show the original image if we actually have a URL resolved for it.
      let hasOriginalUrl = false;
      try {
        if (window.CharacterSheet && typeof CharacterSheet.getOriginalPortraitUrl === 'function') {
          hasOriginalUrl = !!CharacterSheet.getOriginalPortraitUrl(character);
        } else {
          hasOriginalUrl = !!originalPortrait.getAttribute('src');
        }
      } catch (e) {
        hasOriginalUrl = !!originalPortrait.getAttribute('src');
      }

      if (portraitViewMode === 'original' && hasOriginalUrl) {
        asciiPortrait.classList.add('is-hidden');
        originalPortrait.classList.remove('is-hidden');
        if (container) {
          container.classList.add('portrait-container--original-mode');
        }
      } else {
        asciiPortrait.classList.remove('is-hidden');
        originalPortrait.classList.add('is-hidden');
        if (container) {
          container.classList.remove('portrait-container--original-mode');
        }
      }
    } catch (e) {
      // Non-fatal: if anything goes wrong, don't block the render path.
      console.warn('App._applyPreferredPortraitViewBuilder failed', e);
    }
  },

  // Track if we've shown the guest save notice this session
  _guestSaveNoticeShown: false,

  // Explicit save entry point for the completion screen.
  async saveCharacter(showMessage = true) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character || !window.StorageService) {
      this.showSystemMessage(
        'Unable to save character right now. Please try again shortly.',
      );
      return;
    }

    // Note: guest mode no longer has a local-storage character cap; daily quota
    // is enforced server-side and surfaced via _creationQuotaInfo.

    // Validate character has minimum required fields before saving
    if (!character.name || !character.race || !character.class) {
      if (showMessage) {
        this.showSystemMessage(
          'Character must have at least a name, race, and class before saving.',
        );
      }
      return;
    }

    try {
      console.log('💾 Saving character to shared storage (explicit save)...');
      // Saving should be a non-disruptive action – we don't want to re-animate
      // the ASCII portrait when the only change is an assigned ID/timestamps.
      this._suppressNextPortraitAnimation = true;

      // Build a complete character snapshot with derived stats (AC, speed, etc.)
      const completeCharacter = this.buildCompleteCharacter(character);
      const saved = await window.StorageService.saveCharacter(completeCharacter);
      CharacterState.updateCharacter(saved);

      // Clear the in-progress session since character is now saved
      CharacterState.clearSession();

      if (showMessage) {
        // Use a short, non-intrusive toast instead of an inline narrator system line.
        this.showToast('Character saved');
      }

      // Focus the "Create Another Character" button for keyboard navigation
      const newBtn = document.getElementById('completion-new-btn');
      if (newBtn) {
        newBtn.focus();
      }

      // Show reminder to log in if in guest mode (only once per session)
      if (!this._guestSaveNoticeShown && window.AuthService && !window.AuthService.isAuthenticated()) {
        this._guestSaveNoticeShown = true;
        // Set flag to show guest notice banner when returning to character manager
        sessionStorage.setItem('showGuestNoticeOnReturn', 'true');
        setTimeout(() => {
          this.showNotification('💡 Log in or create an account to save your character to the cloud', 'info');
        }, 1000);
      }
    } catch (error) {
      console.error('Error saving character:', error);
      this.showSystemMessage('Save failed: ' + error.message);
    }
  },

  // Save character and exit to character manager
  async saveAndExit() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character || !window.StorageService) {
      this.showSystemMessage(
        'Unable to save character right now. Please try again shortly.',
      );
      return;
    }

    // Validate character has minimum required fields before saving
    if (!character.name || !character.race || !character.class) {
      this.showSystemMessage(
        'Character must have at least a name, race, and class before saving.',
      );
      return;
    }

    try {
      console.log('💾 Saving character and exiting...');
      this._suppressNextPortraitAnimation = true;

      // Build a complete character snapshot with derived stats (AC, speed, etc.)
      const completeCharacter = this.buildCompleteCharacter(character);
      const saved = await window.StorageService.saveCharacter(completeCharacter);
      CharacterState.updateCharacter(saved);

      // Clear the in-progress session since character is now saved
      CharacterState.clearSession();

      this.showToast('Character saved');

      // Show reminder to log in if in guest mode
      if (!this._guestSaveNoticeShown && window.AuthService && !window.AuthService.isAuthenticated()) {
        this._guestSaveNoticeShown = true;
        sessionStorage.setItem('showGuestNoticeOnReturn', 'true');
      }

      // Navigate to character manager after a brief moment
      setTimeout(() => {
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      }, 500);
    } catch (error) {
      console.error('Error saving character:', error);
      this.showSystemMessage('Save failed: ' + error.message);
    }
  },

  buildCompleteCharacter(character) {
    // Get data from DND_DATA
    const race = DND_DATA.races.find((r) => r.id === character.race);
    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const background = DND_DATA.backgrounds.find((b) => b.id === character.background);

    // Calculate ability modifiers
    const abilityMods = {
      str: Utils.abilityModifier(character.abilities.str),
      dex: Utils.abilityModifier(character.abilities.dex),
      con: Utils.abilityModifier(character.abilities.con),
      int: Utils.abilityModifier(character.abilities.int),
      wis: Utils.abilityModifier(character.abilities.wis),
      cha: Utils.abilityModifier(character.abilities.cha)
    };

    // Calculate derived stats
    const proficiencyBonus = Math.ceil(character.level / 4) + 1;
    const initiative = abilityMods.dex;
    // Prefer any armorClass already stored on the character (e.g., from builder),
    // otherwise derive a reasonable default based on class + abilities + armor.
    const armorClass =
      character.armorClass != null
        ? character.armorClass
        : KeyboardNav.calculateArmorClassForClass(
            character.class,
            character.abilities,
            character.armorCategory,
            character.hasShield,
          );
    const speed = race?.speed || 30;

    // Calculate HP (if not already set)
    const hitPoints = character.hitPoints || (classData ? classData.hitDie + abilityMods.con : 0);

    // Build skill modifiers
    const skills = {};
    if (character.skillProficiencies) {
      character.skillProficiencies.forEach(skill => {
        const abilityForSkill = this.getSkillAbility(skill);
        const abilityMod = abilityMods[abilityForSkill];
        skills[skill] = abilityMod + proficiencyBonus;
      });
    }

    // Build starting armor items based on armorCategory/hasShield
    // Note: armor helpers live on `KeyboardNav` for now, so call through that namespace.
    const armorItems = KeyboardNav.getStartingArmorItems(
      character.class,
      character.armorCategory,
      character.hasShield,
    );

    // Merge armor items into explicit equipment (without duplicating)
    const explicitEquipment = [...(character.equipment || [])];
    armorItems.forEach((item) => {
      if (!explicitEquipment.includes(item)) {
        explicitEquipment.push(item);
      }
    });

    // Get portrait data
    const portraitContainer = document.getElementById('character-portrait');
    const portraitElement = portraitContainer
      ? portraitContainer.querySelector('pre')
      : null;
    const asciiArt = portraitElement
      ? portraitElement.textContent
      : portraitContainer
      ? portraitContainer.textContent.trim()
      : null;
    
    const originalPortrait = character.portrait?.url || character.portraitUrl || character.originalPortraitUrl || null;
    
    // Get ASCII art from various possible sources
    const portraitAscii = character.customPortraitAscii || character.asciiPortrait || asciiArt || null;

    // Ensure character has a stable UID for cross-app identity
    let stableUid = character.characterUid;
    if (!stableUid) {
      stableUid = `danddy_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({ characterUid: stableUid });
      } else {
        character.characterUid = stableUid;
      }
    }

    // Build complete character object
    return {
      // Export metadata (used by Character Manager to detect true duplicates)
      metadata: {
        exportVersion: '1.1',
        exportDate: new Date().toISOString(),
        exportedBy: 'DandDy Character Builder v1.4',
        characterUid: stableUid,
        source: 'builder',
      },

      // Basic info (original)
      ...character,

      // Normalized portrait object for compatibility with character manager
      portrait: portraitAscii || originalPortrait ? {
        ascii: portraitAscii,
        url: originalPortrait
      } : null,

      // Calculated stats
      abilityModifiers: abilityMods,
      proficiencyBonus,
      initiative,
      armorClass,
      speed,
      hitPoints,
      armorCategory: character.armorCategory || null,
      hasShield: !!character.hasShield,

      // Skills with modifiers
      skillModifiers: skills,

      // Saving throws
      savingThrows: classData?.savingThrows || [],
      savingThrowModifiers: this.calculateSavingThrows(abilityMods, classData?.savingThrows || [], proficiencyBonus),

      // Derived data from DND_DATA
      raceData: race ? {
        name: race.name,
        size: race.size,
        speed: race.speed,
        traits: race.traits,
        languages: race.languages
      } : null,

      classData: classData ? {
        name: classData.name,
        hitDie: classData.hitDie,
        primaryAbility: classData.primaryAbility,
        savingThrows: classData.savingThrows,
        skills: classData.skills,
        equipment: classData.equipment,
        spellcaster: classData.spellcaster || false
      } : null,

      backgroundData: background ? {
        name: background.name,
        description: background.description,
        feature: background.feature,
        skillProficiencies: background.skillProficiencies,
        toolProficiencies: background.toolProficiencies,
        languages: background.languages,
        equipment: background.equipment
      } : null,

      // Equipment (including any inferred armor/shield items)
      equipment: explicitEquipment,

      // Portrait data
      portrait: {
        ascii: asciiArt,
        original: originalPortrait
      }
    };
  },

  getSkillAbility(skill) {
    const skillAbilities = {
      'acrobatics': 'dex',
      'animal-handling': 'wis',
      'arcana': 'int',
      'athletics': 'str',
      'deception': 'cha',
      'history': 'int',
      'insight': 'wis',
      'intimidation': 'cha',
      'investigation': 'int',
      'medicine': 'wis',
      'nature': 'int',
      'perception': 'wis',
      'performance': 'cha',
      'persuasion': 'cha',
      'religion': 'int',
      'sleight-of-hand': 'dex',
      'stealth': 'dex',
      'survival': 'wis'
    };
    return skillAbilities[skill] || 'str';
  },

  calculateSavingThrows(abilityMods, savingThrows, proficiencyBonus) {
    const saves = {};
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
      const isProficient = savingThrows.includes(ability);
      saves[ability] = abilityMods[ability] + (isProficient ? proficiencyBonus : 0);
    });
    return saves;
  },

  printCharacterSheet() {
    const panel = document.getElementById('character-panel');
    if (!panel || !panel.querySelector('.character-sheet')) {
      this.showSystemMessage('No character sheet to print yet.');
      return;
    }

    // Defer to the browser's print dialog, with print-specific CSS handling
    // what is visible on the page.
    window.print();
  },

  // Render a system-style message in the narrator panel instead of using
  // window.alert. Keeps all feedback in-universe.
  showSystemMessage(text) {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(`<span class="text-warning">[SYSTEM]${text}</span>`),
    );
    Utils.scrollToBottom(true);
  },

  // Toast used for quick, non-blocking feedback (e.g. "Prompt copied"), anchored to the terminal container.
  showToast(rawMessage, duration = 4000) {
    const message = (rawMessage == null) ? '' : String(rawMessage);
    // Remove any leading glyphs (checkmarks, warning icons, etc.) so builder
    // toasts stay clean and rely only on text + the "×" close button. Also
    // trim stray leading/trailing whitespace so messages render cleanly.
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

    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'toast-notification';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      // Inner structure: message + dismiss "X" pinned to the right in its own wrapper
      // The inner span gets the shared spin treatment used elsewhere in the app.
      toast.innerHTML = `<span class="toast-message"></span><div class="toast-dismiss-wrapper"><button type="button"class="toast-dismiss"aria-label="Dismiss notification"><span class="toast-dismiss-icon">&times;</span></button></div>`;

      const container = document.querySelector('.terminal-container') || document.body;
      container.appendChild(toast);

      const dismissBtn = toast.querySelector('.toast-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          toast.classList.remove('show');
          // Clear any pending show/hide timers
          if (App._toastShowTimeout) {
            clearTimeout(App._toastShowTimeout);
            App._toastShowTimeout = null;
          }
          if (App._toastTimeout) {
            clearTimeout(App._toastTimeout);
            App._toastTimeout = null;
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
    if (App._toastShowTimeout) {
      clearTimeout(App._toastShowTimeout);
      App._toastShowTimeout = null;
    }
    if (App._toastTimeout) {
      clearTimeout(App._toastTimeout);
      App._toastTimeout = null;
    }

    // Ensure we start from the hidden state so the transition always plays,
    // even immediately after a page reload.
    toast.classList.remove('show');
    // Force a reflow so the browser acknowledges the hidden state
    // before we add the "show" class.
    void toast.offsetWidth; // eslint-disable-line no-unused-expressions

    App._toastShowTimeout = setTimeout(() => {
      toast.classList.add('show');
      App._toastShowTimeout = null;

      // Auto-dismiss after specified duration (default 4s for success messages)
      App._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        App._toastTimeout = null;
      }, duration);
    }, 80);
  },

  // ===== LEVEL CHANGE =====
  openLevelModal() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const currentLevel = character.level || 1;

    const modalHTML = `<div id="levelModal"class="modal show"onclick="App.closeLevelModal()"><div class="modal-content"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Change Character Level</h2><button class="modal-close"onclick="App.closeLevelModal()">&times;</button></div><div class="modal-body"><p class="terminal-text">Changing level will<span class="terminal-text-strong">adjust your ability scores and hit points</span>as if your character had gained Ability Score Increases at higher levels.</p><p class="terminal-text-small terminal-text-dim">This cannot be undone.Choose a new level between 1 and 99.</p><div class="level-modal-row modal-section"><label for="level-input"class="terminal-text-small modal-section-label">New Level:</label><input
type="number"
id="level-input"
class="terminal-input"
min="1"
max="99"
value="${currentLevel}"></div><div id="level-modal-error"class="terminal-text-error level-modal-error is-hidden"></div></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="App.closeLevelModal()">CANCEL</button><button class="terminal-btn terminal-btn-primary"onclick="App.confirmLevelModal()">APPLY LEVEL</button></div></div></div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('levelModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._levelModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeLevelModal();
    };
    document.addEventListener('keydown', this._levelModalEscHandler);
  },

  closeLevelModal() {
    const modal = document.getElementById('levelModal');
    if (!modal) {
      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  async confirmLevelModal() {
    const input = document.getElementById('level-input');
    if (!input) {
      this.closeLevelModal();
      return;
    }

    const errorEl = document.getElementById('level-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    let newLevel = parseInt(input.value, 10);
    if (isNaN(newLevel) || newLevel < 1 || newLevel > 99) {
      showError('Level must be a number between 1 and 99.');
      return;
    }

    clearError();

    this.closeLevelModal();
    await this.applyLevelChange(newLevel);
  },

  async applyLevelChange(newLevel) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const race = DND_DATA.races.find((r) => r.id === character.race);

    if (!classData || !race) {
      this.showSystemMessage(
        'Unable to change level because race or class data is missing.',
      );
      return;
    }

    // Start from base (level 1) abilities, falling back to current if missing
    const base = character.baseAbilities || character.abilities;
    let abilities = { ...base };

    // Simulate Ability Score Increases at levels 4, 8, 12, 16, 19
    const asiLevels = [4, 8, 12, 16, 19];
    const asiCount = asiLevels.filter((lvl) => lvl <= newLevel).length;
    let remainingPoints = asiCount * 2;

    const primary = classData.primaryAbility?.[0] || 'str';
    const secondary = classData.primaryAbility?.[1] || null;

    // Distribute ASI points across primary/secondary, capped at 20
    while (remainingPoints > 0) {
      const candidates = [];
      if (abilities[primary] < 20) candidates.push(primary);
      if (secondary && abilities[secondary] < 20) candidates.push(secondary);

      if (candidates.length === 0) {
        break;
      }

      const target = candidates[0];
      abilities[target] += 1;
      remainingPoints -= 1;
    }

    // Approximate HP across levels:
    // Level 1: full hit die + CON mod
    // Each additional level: average die (rounded up) + CON mod
    const conMod = Utils.abilityModifier(abilities.con);
    const baseHP = classData.hitDie + conMod;
    const averageDie = Math.floor(classData.hitDie / 2) + 1;
    const perLevel = Math.max(1, averageDie + conMod);
    const hitPoints =
      newLevel <= 1 ? baseHP : baseHP + (newLevel - 1) * perLevel;

    // Recalculate Armor Class based on updated abilities + existing armor loadout
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      character.class,
      abilities,
      character.armorCategory,
      character.hasShield,
    );

    CharacterState.updateCharacter({
      level: newLevel,
      abilities,
      hitPoints,
      armorClass,
    });

    this.showSystemMessage(
      `Level set to ${newLevel}.Ability scores and hit points have been re-rolled.`,
    );

    // Persist level/stat changes so manager stays in sync
    await this.persistIfAlreadySaved();
  },

  // ===== NAME CHANGE =====
  openNameModal() {
    const state = CharacterState.get();
    const character = state.character;

    const currentName = character.name || '';

    const modalHTML = `<div id="nameModal"class="modal show"onclick="App.closeNameModal()"><div class="modal-content"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Change Character Name</h2><button class="modal-close"onclick="App.closeNameModal()">&times;</button></div><div class="modal-body"><p class="terminal-text">Enter a new name for your character.</p><div class="name-modal-row modal-section"><label for="name-input"class="terminal-text-small modal-section-label">New Name:</label><input
type="text"
id="name-input"
class="terminal-input name-modal-input"
value="${currentName}"
placeholder="Enter character name"></div><div id="name-modal-error"class="terminal-text-error name-modal-error is-hidden"></div></div><div class="modal-footer modal-footer-end"><button class="terminal-btn"onclick="App.closeNameModal()">CANCEL</button><button class="terminal-btn terminal-btn-primary"onclick="App.confirmNameModal()">APPLY NAME</button></div></div></div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('nameModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._nameModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeNameModal();
    };
    document.addEventListener('keydown', this._nameModalEscHandler);
  },

  closeNameModal() {
    const modal = document.getElementById('nameModal');
    if (!modal) {
      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  async confirmNameModal() {
    const input = document.getElementById('name-input');
    if (!input) {
      this.closeNameModal();
      return;
    }

    const errorEl = document.getElementById('name-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    const newName = input.value.trim();
    if (!newName) {
      showError('Name cannot be empty.');
      return;
    }

    clearError();

    this.closeNameModal();
    await this.applyNameChange(newName);
  },

  async applyNameChange(newName) {
    // Update the character name in state (this will trigger observers)
    CharacterState.updateCharacter({ name: newName });

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(
        `Character renamed to"${newName}".Identity crisis averted.`,
      ),
    );
    Utils.scrollToBottom(true);

    // Persist rename so manager sees updated name
    await this.persistIfAlreadySaved();
  },

  // ===== QUICK CREATE MODE =====
  
  // Generate AI portrait for quick-create mode (runs in background)
  async _generateQuickCreatePortrait() {
    try {
      const stateAfter = CharacterState.get();
      const currentChar = stateAfter.character || {};

      if (!CONFIG.ENABLE_AI || !currentChar.race || !currentChar.class || !window.AsciiArtService) {
        return;
      }

      // Wait for DOM to update before trying to render the loader.
      // The character sheet may not exist yet if state changes are still pending.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      let portraitEl = document.getElementById('character-portrait');

      // Retry a few times if the element doesn't exist yet (DOM may still be updating)
      if (!portraitEl) {
        for (let i = 0; i < 5 && !portraitEl; i++) {
          await Utils.sleep(100);
          portraitEl = document.getElementById('character-portrait');
        }
      }

      // Show a loading state in the portrait panel while the AI image
      // is being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(currentChar, {
        creationGrantId: currentChar && currentChar.portraitGrantId,
      });

      if (result && result.asciiArt) {
        const currentCount = currentChar.customPortraitCount || 0;

        // Get the current style theme for tagging
        let quickStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            quickStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
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

        const updatedMetadata = window.PortraitHistory
          ? window.PortraitHistory.addVersion(
              currentChar,
              result.asciiArt,
              result.imageUrl || null,
              {
                source: 'quick-ai',
                prompt:
                  (AIService.buildPortraitPrompt &&
                    AIService.buildPortraitPrompt(currentChar)) ||
                  null,
                style: quickStyle,
                model: generationModel,
                quality: generationQuality,
              },
            )
          : currentChar.portraitMetadata || {};

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
          // Grant was successfully redeemed; clear it so later regenerations
          // (Customize portrait) always count against custom image quota.
          portraitGrantId: null,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Quick-create AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Quick Create Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers:${categories}.`;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a basic portrait to fall back to.
      await this._ensurePreGeneratedPortraitFallback(currentChar, { force: true });
    } finally {
      // Whatever happens above (success or failure), stop the animated dots
      // and restore portrait font size so the ASCII art uses CSS defaults.
      this._stopPortraitLoadingAnimation();
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  async quickCreateCharacter() {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;

    // Clear any existing content for a clean quick-create experience
    narratorPanel.innerHTML = '';
    
    // Reset portrait tracking to ensure animation happens
    this._lastPortraitArt = null;

    // In quick-create, we never want to show pre-generated portrait templates.
    // Start by clearing any existing portrait fields on the in-progress
    // character so the sheet renders with *no* art until custom AI kicks in.
    if (window.CharacterState && typeof CharacterState.updateCharacter === 'function') {
      CharacterState.updateCharacter({
        asciiPortrait: null,
        asciiPortraitKey: null,
        customPortraitAscii: null,
        originalPortraitUrl: null,
        portrait: null,
        portraitMetadata: null,
        customPortraitCount: 0,
      });
    }

    // Intro message for quick create (narrator-specific)
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const introEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      introEl,
      narrator.quickCreateIntro,
    );
    Utils.scrollToBottom(true);

    // Randomly choose race, class, background, alignment, sex
    const race = Utils.randomChoice(DND_DATA.races);
    const cls = Utils.randomChoice(DND_DATA.classes);
    const background = Utils.randomChoice(DND_DATA.backgrounds);
    const alignment = Utils.randomChoice(DND_DATA.alignments);
    const sex = Utils.randomChoice(['male', 'female']);

    // Roll abilities using the existing rollAbility helper and apply racial bonuses
    let abilities = {
      str: this.rollAbility(),
      dex: this.rollAbility(),
      con: this.rollAbility(),
      int: this.rollAbility(),
      wis: this.rollAbility(),
      cha: this.rollAbility(),
    };

    Object.keys(race.abilityBonuses).forEach((ability) => {
      abilities[ability] += race.abilityBonuses[ability];
    });

    // Infer a coarse armor loadout from class equipment using the shared
    // helpers on KeyboardNav (where armor logic lives).
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      cls.id,
    );

    // Calculate HP for level 1
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = cls.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      cls.id,
      abilities,
      armorCategory,
      hasShield,
    );

    // Try to auto-generate name + backstory in a SINGLE API call
    // (uses the combined /characters/summary endpoint to save rate limit)
    let name = '';
    let backstory = '';
    
    // Show thinking message for name + backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const thinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(thinkingEl);
    
    try {
      // Build a temporary character object for the summary call
      const tempChar = {
        race: race.id,
        class: cls.id,
        background: background.id,
        alignment: alignment.id,
        sex: sex,
      };
      const summary = await AIService.generateCharacterSummary(tempChar, { nameCount: 3 });
      
      // Pick a random name from suggestions
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        name = Utils.randomChoice(summary.names);
      }
      
      // Substitute {{NAME}} in the backstory template
      if (summary && summary.backstoryTemplate) {
        backstory = summary.backstoryTemplate.replace(/\{\{NAME\}\}/g, name || 'The adventurer');
      }

      // Stash one-time included-portrait grant for this creation run.
      if (summary && summary.portraitGrantId) {
        CharacterState.updateCharacter({
          portraitGrantId: summary.portraitGrantId,
        });
      }
    } catch (e) {
      // Ignore AI errors; we'll fall back below
      console.error('Quick create summary error:', e);
    }
    
    // Stop thinking and remove the message
    this.stopProgressiveThinking();
    thinkingEl.parentElement.remove();

    // Fallback name if AI failed
    if (!name) {
      const fallbackNames = [
        'Ashen Vale',
        'Rin Thorn',
        'Kael Brightwind',
        'Lyra Nightbloom',
      ];
      name = Utils.randomChoice(fallbackNames);
    }
    
    // Fallback backstory if AI failed
    if (!backstory) {
      backstory =
        'A mysterious past, a questionable present, and a future that depends entirely on your dice.';
    }

    // Set flag BEFORE state update so updateCharacterPanel knows to show the loader
    // instead of any stale/fallback image. The actual generation promise is set
    // later, but this flag tells the panel "generation is coming".
    this._quickCreatePortraitPending = true;

    // Update character state with all basic info at once to avoid multiple renders
    CharacterState.updateCharacter({
      race: race.id,
      class: cls.id,
      background: background.id,
      alignment: alignment.id,
      sex: sex,
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
      name,
      backstory,
      // Apply background benefits
      skillProficiencies: background.skillProficiencies || [],
      toolProficiencies: background.toolProficiencies || [],
      equipment: background.equipment || [],
      backgroundFeature: background.feature || null,
      languageChoices: background.languages || 0,
    });
    CharacterState.set({ abilityMethod: 'roll' });

    // Show a short summary of what we picked (narrator-specific)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const summaryEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      summaryEl,
      narrator.quickCreateSummary(race.name, cls.name, background.name, alignment.name, sex.charAt(0).toUpperCase() + sex.slice(1)),
    );
    Utils.scrollToBottom(true);

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(nameEl, narrator.quickCreateName(name));
    Utils.scrollToBottom(true);

    // Start generating AI portrait in background now (runs while backstory displays)
    // IMPORTANT: Render the loader immediately (synchronously) before starting async generation
    // to avoid race conditions where state updates overwrite the loader.
    const portraitEl = document.getElementById('character-portrait');
    if (portraitEl) {
      this._renderPortraitGeneratingLoader(portraitEl);
    }
    // Clear the pending flag now that we're starting the actual generation
    this._quickCreatePortraitPending = false;
    this._quickCreatePortraitGeneration = this._generateQuickCreatePortrait();

    // Show thinking message for backstory (just displaying, no API call needed)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    
    // Show the actual backstory
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(1500);
    backstoryThinkingEl.classList.remove('is-waiting');

    // Auto-select spells if character is a spellcaster
    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(cls.id)) {
      const spells = SPELL_DATA.getQuickModeSpells(cls.id);
      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(cls.id);
        CharacterState.updateCharacter({
          spellcastingAbility: config.ability,
          cantrips: spells.cantrips,
          spellsKnown: spells.firstLevel,
          spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
          spellSlots: config.spellSlots,
        });
        
        // Show a brief message about spell selection
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        const spellsEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        await Utils.typewriter(
          spellsEl,
          `>${' '}Auto-selected ${spells.cantrips.length}${' '}cantrip${spells.cantrips.length!==1?'s':''}${' '}and ${spells.firstLevel.length}${' '}1st level spell${spells.firstLevel.length!==1?'s':''}${' '}for your ${cls.name}.`,
        );
        Utils.scrollToBottom(true);
        
        await Utils.sleep(1000);
      }
    }

    // Wait for portrait generation to complete (if it was started)
    if (this._quickCreatePortraitGeneration) {
      try {
        await this._quickCreatePortraitGeneration;
      } catch (error) {
        // Error already handled in _generateQuickCreatePortrait
      }
      this._quickCreatePortraitGeneration = null;
    }

    // Jump straight to the completion screen
    const completeQuestion = QUESTIONS.find((q) => q.id === 'complete');
    if (completeQuestion) {
      await this.showComplete(completeQuestion);
    }
  },

  startNew() {
    const state = CharacterState.get();
    const character = state.character;

    // Only prompt to save if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Ask the user if they want to save before starting over.
      this.showConfirmationOverlay(
        'You have not saved this character yet. What would you like to do?',
        async () => {
          // User chose SAVE: first attempt to save; if save fails, we keep the current character.
          await this.saveCharacter(true);

          // Re-check that we now have an ID before clearing.
          const latest = CharacterState.get().character;
          if (!latest || !latest.id) {
            this.showSystemMessage(
              'Character was not saved. Staying on the current character.',
            );
            return;
          }

          this._startNewInternal();
        },
        () => {
          // User chose DISCARD: start a fresh character without saving.
          this._startNewInternal();
        },
        {
          primaryLabel: 'SAVE',
          secondaryLabel: 'DISCARD',
          // Both CTAs use the secondary visual style in this flow.
          primaryClass: 'terminal-btn',
        },
      );
    } else {
      // Character is already saved or incomplete; immediately start a new one.
      this._startNewInternal();
    }
  },

  _startNewInternal() {
    // User confirmed: clear current character and restart flow.
    // Clear panels BEFORE resetting state so the state change listener can properly re-render
    const narratorPanel = document.getElementById('narrator-panel');
    const characterPanel = document.getElementById('character-panel');
    if (narratorPanel) narratorPanel.innerHTML = '';
    
    // Reset state and caches
    CharacterState.reset();
    OptionVariationsCache.reset();
    if (window.AIService && typeof AIService.resetNarratorSession === 'function') {
      AIService.resetNarratorSession();
    }
    this._lastPortraitArt = null; // Reset portrait tracking for new character
    
    // Don't manually clear character panel - let the state change listener handle it
    // The CharacterState.reset() above will trigger updateCharacterPanel via the subscriber
    
    // Skip intro and go directly to entry-mode for returning users
    this.showQuestion('entry-mode');
  },

  showConfirmationOverlay(message, onConfirm, onCancel, options) {
    // Support old signature where third param was an options object:
    // showConfirmationOverlay(message, onConfirm, { ...options })
    if (
      options === undefined &&
      typeof onCancel === 'object' &&
      onCancel !== null
    ) {
      options = onCancel;
      onCancel = null;
    }

    options = options || {};

    const targetSelector = options.targetSelector;
    const primaryLabel = options.primaryLabel || 'YES';
    const secondaryLabel =
      options.secondaryLabel === undefined ? 'NO' : options.secondaryLabel;
    const hideSecondary = Boolean(options.hideSecondary);
    const primaryClass =
      options.primaryClass || 'terminal-btn terminal-btn-primary';
    const secondaryClass = options.secondaryClass || 'terminal-btn';

    // While a confirmation dialog is open, pause keyboard navigation so
    // arrow keys don't move focus behind the modal.
    KeyboardNav.deactivate();

    const secondaryBtnHTML =
      hideSecondary || secondaryLabel === null
        ? ''
        : `<button class="${secondaryClass}"id="confirm-no">${secondaryLabel}</button>`;

    const overlayHTML = `<div id="confirmationModal"class="modal show confirmation-overlay"><div class="modal-content"onclick="event.stopPropagation();"><div class="modal-header"><h2 class="modal-title">Confirm</h2></div><div class="modal-body"><p class="terminal-text">${message}</p></div><div class="modal-footer modal-footer-end">${secondaryBtnHTML}<button class="${primaryClass}"id="confirm-yes">${primaryLabel}</button></div></div></div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', overlayHTML);

    const overlay = document.getElementById('confirmationModal');
    const primaryBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-no');

    // Mark this overlay as "just opened" so the same Enter key event that
    // triggered it does NOT immediately auto-confirm. The flag is cleared
    // on the next tick.
    overlay.classList.add('just-opened');
    setTimeout(() => {
      if (overlay && overlay.classList) {
        overlay.classList.remove('just-opened');
      }
    }, 0);

    // Move keyboard focus into the modal so Enter presses are scoped correctly.
    if (primaryBtn) {
      primaryBtn.focus();
    }

    const runCloseAnimation = (onClosed) => {
      if (!overlay || overlay.classList.contains('closing')) {
        return;
      }

      overlay.classList.add('closing');

      const content = overlay.querySelector('.modal-content') || overlay;

      let finished = false;
      const handleClose = () => {
        // Prevent double-execution from both animationend and fallback timeout
        if (finished) return;
        finished = true;

        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }

        // Reactivate keyboard navigation now that the modal is gone.
        KeyboardNav.activate();

        if (typeof onClosed === 'function') {
          onClosed();
        }
      };

      if (content && content.addEventListener) {
        content.addEventListener('animationend', handleClose, { once: true });
        // Fallback timeout in case animationend doesn't fire
        // (e.g., no CSS animation defined or browser quirk)
        setTimeout(handleClose, 400);
      } else {
        handleClose();
      }
    };

    primaryBtn.addEventListener('click', () => {
      runCloseAnimation(onConfirm);
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        runCloseAnimation(onCancel);
      });
    }
  },

  async showChangeConfirmation(questionId, selectedIndex, isListChoice) {
    const message =
      'Changing this answer will reset subsequent choices. Are you sure?';
    const targetSelector = `.question-card[data-question-id="${questionId}"]`;

    this.showConfirmationOverlay(message, async () => {
      // User confirmed change
      const state = CharacterState.get();

      // Find the index of the current question in the QUESTIONS array
      const currentQuestionIndex = QUESTIONS.findIndex(
        (q) => q.id === questionId,
      );

      // Clear answers and character data for all subsequent questions
      for (let i = currentQuestionIndex; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        delete state.answers[q.id];
        if (q.saveTo) {
          CharacterState.updateCharacter({ [q.saveTo]: '' });
        }
      }
      // Remove all narrator content AFTER this question card (dialog + options)
      const narratorPanel = document.getElementById('narrator-panel');
      if (narratorPanel) {
        const anchorCard = narratorPanel.querySelector(targetSelector);
        if (anchorCard) {
          const children = Array.from(narratorPanel.children);
          const anchorIndex = children.indexOf(anchorCard);
          if (anchorIndex !== -1) {
            const toRemove = children.slice(anchorIndex + 1);

            // Fade out downstream elements, then remove them before
            // replaying the flow from this question forward.
            const fadeDurationMs = 400;
            toRemove.forEach((el) => {
              el.classList.add('fade-out');
              // Rely on a simple timeout to guarantee removal
              setTimeout(() => {
                if (el.parentNode) {
                  el.remove();
                }
              }, fadeDurationMs);
            });

            // Wait until after the fade + removal before continuing,
            // so the new branch starts with a clean terminal.
            await Utils.sleep(fadeDurationMs + 50);

            // After cleanup, ensure the anchor question is centered and
            // keyboard navigation starts from that card.
            anchorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }

      // Reset recommendations and option variations cache
      state.recommendations = {};
      OptionVariationsCache.reset();

      // Re-process the selected answer for the current question
      if (isListChoice) {
        await this.handleListAnswer(questionId, selectedIndex);
      } else {
        await this.handleAnswer(questionId, selectedIndex);
      }
    }, { targetSelector });
  },

  // Helper to update status text in header
  updateStatus(text) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  },

  // Character panel renderer (called on state changes)
  async updateCharacterPanel(character) {
    const panel = document.getElementById('character-panel');

    // Determine entry mode (guided vs quick) from shared state so we can
    // adjust portrait behavior. In quick-create we suppress pre-generated
    // portraits until an AI portrait generation has actually started.
    let entryMode = null;
    try {
      if (window.CharacterState && typeof CharacterState.get === 'function') {
        const state = CharacterState.get();
        entryMode = state?.answers?.['entry-mode'] || null;
      }
    } catch (e) {
      // If state lookup fails for any reason, fall back to default behavior.
      entryMode = null;
    }
    const isQuickMode = entryMode === 'quick';
    const isGuidedMode = entryMode === 'guided';

    // If a portrait animation is in progress, queue this update for after animation completes
    if (this._portraitAnimating) {
      this._pendingCharacterUpdate = character;
      return;
    }

    // Avoid redundant re-renders if the character has not actually changed.
    // This keeps us from re-running portrait generation when only transient
    // state (like answers or recommendations) changes.
    try {
      const serialized = JSON.stringify(character);
      if (this._lastRenderedCharacter === serialized) {
        return;
      }
      this._lastRenderedCharacter = serialized;
    } catch (e) {
      // If serialization fails for any reason, fall back to always rendering.
    }
    
    // If we have a race, normally we load a pre-generated portrait
    // (race+class combo or race-only) and fall back to the simple template.
    if (character.race) {
      // In quick-create and co-create (guided) modes, NEVER call the pre-generated 
      // portrait loader. We either show the final custom AI portrait (when available) 
      // or a placeholder message while gathering character information. We explicitly 
      // ignore any asciiPortrait that may have been set by older exports or background 
      // upgrades so templates/pre-generated art never appear during character creation.
      if (isQuickMode || isGuidedMode) {
        // Before custom AI portrait is generated, characters will not yet
        // have a custom portrait. In that case render the sheet with a placeholder
        // message in the portrait area. The placeholder will show:
        // "Your portrait will be generated once we learn more about your character"
        const portraitArt = character.customPortraitAscii || null;

        // Decide whether to animate: only when we have new portrait art that
        // differs from what was last rendered, and we're not explicitly
        // suppressing animation (such as after a save).
        const shouldAnimate =
          !!portraitArt &&
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);

        this._lastPortraitArt = portraitArt || null;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Only show the "★ Custom AI Portrait" button once the initial custom 
        // portrait has been generated and is ready to display. Until then, we 
        // keep the portrait frame but hide the button to avoid suggesting an 
        // action that is already in progress.
        const hasCustomPortrait = !!portraitArt;

        // Always show the portrait container so the placeholder message
        // or custom portrait has a place to render.
        
        // IMPORTANT: If portrait generation is in progress (in either quick or guided mode),
        // we need to preserve the current portrait HTML (the fast-spinning "Generating..." cube).
        // Otherwise the re-render will replace it with the slow "Waiting..." cube.
        // Also check _quickCreatePortraitPending which is set before the state update but
        // before the actual generation promise is assigned.
        const isGenerating =
          !!this._quickCreatePortraitGeneration || !!this._guidedPortraitGenerating || !!this._quickCreatePortraitPending;
        const portraitNode = document.getElementById('character-portrait');
        // Only capture HTML if it's actually the loader (has the --generating class on the cube)
        const hasLoaderRendered = portraitNode && 
          portraitNode.querySelector('.portrait-placeholder-cube--generating');
        const currentPortraitHTML = isGenerating && hasLoaderRendered
          ? portraitNode.innerHTML
          : null;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          null,
          true,
          {
            showGeneratePortraitButton: hasCustomPortrait,
          },
        );

        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Restore the generating state if we captured it, OR render it fresh
        // if we're generating but don't have captured HTML (first render after
        // generation started). This ensures the loader shows even if the sheet
        // is rendered for the first time after portrait generation began.
        if (isGenerating && portraitEl) {
          if (currentPortraitHTML) {
            // Restore previously captured loader HTML
            portraitEl.innerHTML = currentPortraitHTML;
          } else {
            // First render after generation started - render loader fresh
            this._renderPortraitGeneratingLoader(portraitEl);
          }
          // Keep both placeholder + loading classes in sync with the initial
          // loader render so the cube geometry doesn't get distorted after
          // a sheet re-render.
          portraitEl.classList.add('ascii-portrait--placeholder');
          portraitEl.classList.add('ascii-portrait--loading');
          // Ensure the ASCII portrait area is visible (not hidden behind the image)
          portraitEl.classList.remove('is-hidden');
          
          // Hide any existing original image during generation so only the
          // spinning cube loader is visible.
          if (originalPortraitEl) {
            originalPortraitEl.classList.add('is-hidden');
          }
          const portraitContainer = portraitEl.closest('.portrait-container');
          if (portraitContainer) {
            portraitContainer.classList.remove('portrait-container--original-mode');
          }
        }

        if (originalPortraitEl && character.originalPortraitUrl && !isGenerating) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }

        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character so new custom portraits "type in"
            this._portraitAnimating = true;
            this.typePortrait(portraitEl, portraitArt).then(async () => {
              this._portraitAnimating = false;
              // Process any pending updates that came in during animation
              if (this._pendingCharacterUpdate) {
                const pending = this._pendingCharacterUpdate;
                this._pendingCharacterUpdate = null;
                await this.updateCharacterPanel(pending);
              }
            });
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, portraitArt);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        // once elements are wired up so we don't flash the teal background.
        this._applyPreferredPortraitViewBuilder(character);

        return;
      }

      // Legacy mode: Load pre-generated or fallback portrait text
      // This code path is only reached if entryMode is not set (shouldn't happen in normal flow)
      try {
        const portraitArt = await AsciiArtService.generateAIPortrait(character);
        
        // Check again if animation is in progress (might have started while we were loading)
        if (this._portraitAnimating) {
          return;
        }
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);
        
        // If we're about to animate, set the flag BEFORE rendering to prevent race conditions
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = portraitArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Render sheet skeleton, then inject ASCII as text to avoid HTML parsing
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          portraitArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, portraitArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, portraitArt);
            }
          }
        }
      } catch (error) {
        console.error('Error generating portrait:', error);

        // Check again if animation is in progress
        if (this._portraitAnimating) {
          return;
        }

        const fallbackArt = AsciiArtService.getFullPortrait(character);
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== fallbackArt);
        
        // If we're about to animate, set the flag BEFORE rendering
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = fallbackArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          fallbackArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && fallbackArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, fallbackArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, fallbackArt);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        this._applyPreferredPortraitViewBuilder(character);
      }
      return;
    }

    // No race yet – show portrait container with placeholder during character creation.
    // Always show the placeholder in builder mode since user is actively creating a character.
    // The placeholder will display: "Your portrait will be generated once we learn more about your character"
    panel.innerHTML = Components.renderCharacterSheet(
      character,
      null,
      true, // Always show portrait placeholder during initial character creation
    );
  },

  // Animate ASCII portrait character-by-character, line-by-line
  async typePortrait(element, portraitText) {
    const lines = portraitText.split('\n');
    // Use a <pre> child element for proper CSS flex centering
    element.innerHTML = '';
    const pre = document.createElement('pre');
    element.appendChild(pre);
    
    let currentText = '';
    const charsPerFrame = 40; // Type multiple characters per frame for speed
    let charCount = 0;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Type characters in batches
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        currentText += line[charIndex];
        charCount++;

        // Update DOM every N characters
        if (charCount >= charsPerFrame) {
          pre.textContent = currentText;
          charCount = 0;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      
      // Add newline after each line (except the last)
      if (lineIndex < lines.length - 1) {
        currentText += '\n';
      }
    }
    
    // Final update to ensure all text is shown
    pre.textContent = currentText;
  },

});

// ===== AUTHENTICATION & BOOTSTRAP (builder splash handling) =====

let builderSplashActive = true;

let loadingInterval = null;

function startLoadingAnimation() {
  const statusText = document.getElementById('status-text');
  // Previously showed rotating \"fun\" boot messages; now we keep this area quiet.
  if (statusText) {
    statusText.textContent = '';
  }
}

// Flag to suppress beforeunload warning during intentional navigation
let allowNavigationFlag = false;
window.suppressBeforeunloadWarning = () => {
  allowNavigationFlag = true;
};

// Exit back to the Character Manager app from builder mode
function exitToManager() {
  const state = CharacterState.get();
  const character = state.character;

  // Only prompt to save if character is complete (has name, race, class) and unsaved
  const isComplete = character && character.name && character.race && character.class;
  const hasUnsavedChanges = character && !character.id && isComplete;

  if (hasUnsavedChanges) {
    // Ask the user if they want to save before exiting
    App.showConfirmationOverlay(
      'You have unsaved changes. What would you like to do?',
      async () => {
        // User clicked "SAVE" - attempt to save; if save fails, we stay in the builder
        await App.saveCharacter(true);

        // Re-check that we now have an ID before exiting
        const latest = CharacterState.get().character;
        if (!latest || !latest.id) {
          App.showSystemMessage(
            'Character was not saved. Staying in the builder.',
          );
          return;
        }

        // Character saved successfully, proceed to exit
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      },
      () => {
        // User clicked "DISCARD" - exit without saving
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      },
      {
        primaryLabel: 'SAVE',
        secondaryLabel: 'DISCARD',
        primaryClass: 'terminal-btn',
        secondaryClass: 'terminal-btn'
      }
    );
  } else {
    // Character is already saved or incomplete; immediately exit
    window.suppressBeforeunloadWarning();
    window.location.href = '../index.html?from=builder';
  }
}

function dismissBuilderSplash(instant = false) {
  const splash = document.getElementById('splash-content');
  const mainContent = document.getElementById('main-content');

  if (!splash || !builderSplashActive) return;
  builderSplashActive = false;

  if (instant) {
    splash.classList.add('is-hidden');
    if (mainContent) {
      mainContent.classList.remove('is-hidden');
    }
  } else {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('is-hidden');
      if (mainContent) {
        mainContent.classList.remove('is-hidden');
      }
    }, 300);
  }
}


// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  // Start loading animation
  startLoadingAnimation();
  
  // 🔥 Wake up the backend server early (Render cold start can take 30-50s)
  if (CONFIG.ENABLE_AI) {
    console.log('%c🚀 BOOT: Waking up backend server early...', 'color: #0ff; font-weight: bold');
    AIService.warmupBackend();
  }

  // Show main content immediately (behind splash)
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.remove('is-hidden');
  }

  // Splash screen handlers (press any key / click to begin)
  const splash = document.getElementById('splash-content');
  if (splash) {
    const keyHandler = (e) => {
      if (!builderSplashActive) return;
      e.preventDefault();
      e.stopPropagation();
      dismissBuilderSplash();
    };

    window.addEventListener('keydown', keyHandler);
    splash.addEventListener('click', () => dismissBuilderSplash(), { once: true });
  }

  // Initialize the builder app
  await App.init();

  // Stop loading animation once initialized
  if (loadingInterval) {
    clearInterval(loadingInterval);
  }
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = '';
  }

  // Keep narrator panel scrolled to bottom on resize
  window.addEventListener('resize', () => {
    Utils.scrollToBottom();
  });

  // Warn before leaving page if there are unsaved changes
  window.addEventListener('beforeunload', (e) => {
    // Skip warning if navigation is intentional (user clicked DISCARD/SAVE)
    if (allowNavigationFlag) return;

    const state = CharacterState.get();
    const character = state.character;

    // Only prompt if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Modern browsers ignore custom messages and show a generic one
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
      return ''; // Some browsers require a return value
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // Don't interfere if there's any modal open
    if (document.querySelector('.modal.show')) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      KeyboardNav.moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      KeyboardNav.moveDown();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      KeyboardNav.moveLeft();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      KeyboardNav.moveRight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      KeyboardNav.select();
    }
  });

  // When a modal is open, pressing Cmd/Ctrl+Enter should trigger its primary action.
  window.addEventListener('keydown', (e) => {
    if (!(e.key === 'Enter' && (e.metaKey || e.ctrlKey))) return;
    const modal = document.querySelector('.modal.show');
    if (!modal || modal.classList.contains('just-opened')) return;

    // Only trigger the modal's primary action if focus is currently inside
    // the modal.
    const activeElement = document.activeElement;
    if (!activeElement || !modal.contains(activeElement)) return;

    const primaryBtn = modal.querySelector('.modal-footer .terminal-btn-primary');
    if (primaryBtn) {
      e.preventDefault();
      primaryBtn.click();
    }
  });
});





// ===== BUNDLE PART: character-builder/character-builder-manager.js =====

// ========================================
// CHARACTER BUILDER - CLOUD INTEGRATION
// ========================================
// Handles authentication UI and cloud storage for Character Builder

// ========================================
// AUTHENTICATION UI HANDLERS
// ========================================

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('show');
        showLoginForm();
        return;
    }
    // Integrated builder page uses AuthUI full-screen overlay instead of manager modal.
    if (window.App && typeof window.App.showAuthScreen === 'function') {
        window.App.showAuthScreen();
        return;
    }
    if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
        window.AuthUI.showLogin(
            () => location.reload(),
            () => {},
            () => {},
        );
    }
}

// The builder's auth modal markup uses the same cancel handler name as the manager.
function cancelAuthFlow() {
    closeAuthModal();
}

// Builder auth modal includes a "Forgot password?" link; route to manager reset UI.
function openPasswordResetFromLogin() {
    window.location.href = '../index.html#password-reset';
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    const err = document.getElementById('authError');
    if (!modal || !err) {
        // No-op for builder page
        return;
    }
    modal.classList.remove('show');
    err.classList.add('is-hidden');
    // Clear form fields
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const registerEmail = document.getElementById('registerEmail');
    const registerPassword = document.getElementById('registerPassword');
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');

    if (loginEmail) loginEmail.value = '';
    if (loginPassword) {
        loginPassword.value = '';
        loginPassword.type = 'password';
    }
    if (registerEmail) registerEmail.value = '';
    if (registerPassword) {
        registerPassword.value = '';
        registerPassword.type = 'password';
    }
    if (registerPasswordConfirm) {
        registerPasswordConfirm.value = '';
        registerPasswordConfirm.type = 'password';
    }

    // Reset toggle labels back to SHOW
    document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
        try {
            btn.textContent = 'SHOW';
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('aria-label', 'Show password');
        } catch (_) {}
    });
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = 'LOGIN';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = 'REGISTER';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

async function handleLogin() {
    console.log('[handleLogin] Function called');
    const errorEl = document.getElementById('authError');

    // If the login form is hidden (user is on the REGISTER tab), do nothing.
    // This avoids showing "Please enter both email and password" errors on
    // the register screen if some stray event fires the login handler.
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl && loginFormEl.classList.contains('is-hidden')) {
        console.log('[handleLogin] Aborted: loginForm is hidden');
        return;
    }

    // See note in character-manager.js: password managers / autofill can race
    // with our click handler. Wait briefly before reading values to avoid
    // false "Please enter both email and password" errors.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    console.log('[handleLogin] Got email:', email ? '(provided)' : '(empty)');

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.remove('is-hidden');
        console.log('[handleLogin] Validation failed: missing email or password');
        return;
    }

    console.log('[handleLogin] Calling AuthService.login...');
    try {
        const result = await window.AuthService.login(email, password);
        console.log('[handleLogin] AuthService.login returned:', result);
        if (result.success) {
            console.log(`✓ Logged in as ${email}`);
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Logged in as ${email}`, 'success');
            }
            
            // Refresh the page to ensure all data is fresh
            // (quota counts, admin status, etc.)
            setTimeout(() => {
                window.location.reload();
            }, 300);
            return;
        } else {
            errorEl.textContent = result.error || 'Login failed';
            errorEl.classList.remove('is-hidden');
            console.log('[handleLogin] Login failed:', result.error);
        }
    } catch (error) {
        console.error('[handleLogin] Exception:', error);
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    }
}

async function handleRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirmEl = document.getElementById('registerPasswordConfirm');
    const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';
    const errorEl = document.getElementById('authError');

    if (!email || !password || (passwordConfirmEl && !passwordConfirm)) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    if (passwordConfirmEl && password !== passwordConfirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.register(email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Registered as ${email}`);

            // Start session monitoring now that user is logged in
            if (typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Registered as ${email}`,'success');}}else{errorEl.textContent=result.error||'Registration failed';errorEl.classList.remove('is-hidden');}}catch(error){errorEl.textContent='Registration failed. Please try again.';errorEl.classList.remove('is-hidden');}}
function handleLogout(){if(!window.App||!window.App.showConfirmationOverlay){window.AuthService.logout();updateAuthUI();showAuthModal();return;}
window.App.showConfirmationOverlay('Log out? Your character will be saved to the cloud before logging out.',async()=>{if(window.CharacterState&&window.CharacterState.current.character.name){await saveCurrentCharacterToCloud();}
window.AuthService.logout();updateAuthUI();console.log('✓ Logged out');if(window.App&&window.App.showNotification){window.App.showNotification('✓ Logged out','success');}
showAuthModal();},);}
function updateAuthUI(){const authBtn=document.getElementById('authBtn');const userInfoDisplay=document.getElementById('userInfoDisplay');const userStatusIcon=document.getElementById('userStatusIcon');const userStatusText=document.getElementById('userStatusText');if(!authBtn||!userInfoDisplay||!userStatusIcon||!userStatusText){if(typeof window.updateAuthUI==='function'){window.updateAuthUI();}
return;}
if(window.AuthService&&window.AuthService.isAuthenticated()){const user=window.AuthService.getCurrentUser();userStatusIcon.textContent='☁';userStatusText.textContent=user?user.email:'Logged In';authBtn.textContent='LOGOUT';authBtn.onclick=handleLogout;}else{userStatusIcon.textContent='▣';userStatusText.textContent='Guest mode';authBtn.textContent='LOGIN';authBtn.onclick=showAuthModal;}}
function initBuilderAuthModalWiring(){const loginPasswordInput=document.getElementById('loginPassword');const registerPasswordConfirmInput=document.getElementById('registerPasswordConfirm');if(loginPasswordInput){loginPasswordInput.addEventListener('keypress',(e)=>{if(e.key==='Enter'){e.preventDefault();handleLogin();}});}
if(registerPasswordConfirmInput){registerPasswordConfirmInput.addEventListener('keypress',(e)=>{if(e.key==='Enter'){e.preventDefault();handleRegister();}});}
document.addEventListener('keydown',(e)=>{if(e.key!=='Escape')return;const modal=document.getElementById('authModal');if(modal&&modal.classList.contains('show')){e.preventDefault();cancelAuthFlow();}});const passwordToggleButtons=document.querySelectorAll('.password-toggle-btn');passwordToggleButtons.forEach((btn)=>{btn.addEventListener('click',()=>{const targetId=btn.getAttribute('data-target');if(!targetId)return;const input=document.getElementById(targetId);if(!input)return;const isPassword=input.type==='password';input.type=isPassword?'text':'password';btn.textContent=isPassword?'HIDE':'SHOW';btn.setAttribute('aria-pressed',String(isPassword));btn.setAttribute('aria-label',isPassword?'Hide password':'Show password');});});}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initBuilderAuthModalWiring);}else{initBuilderAuthModalWiring();}
async function saveCurrentCharacterToCloud(){try{if(!window.AuthService||!window.AuthService.isAuthenticated()){console.log('💾 Not logged in - character saved to localStorage only');return false;}
if(!window.CharacterCloudStorage){console.error('☁️ CharacterCloudStorage not available');return false;}
const character=window.CharacterState.current.character;if(!character.name){console.log('☁️ Character has no name yet - skipping cloud save');return false;}
console.log('☁️ Saving character to cloud:',character.name);const allCloudChars=await window.CharacterCloudStorage.getAll();const existingChar=allCloudChars.find(c=>c.characterUid===character.characterUid||c.metadata?.characterUid===character.characterUid);if(existingChar){console.log('☁️ Updating existing character in cloud:',existingChar.id);await window.CharacterCloudStorage.update(existingChar.id,character);console.log('☁️ Character updated in cloud successfully');}else{console.log('☁️ Creating new character in cloud');const result=await window.CharacterCloudStorage.add(character);console.log('☁️ Character created in cloud with ID:',result.id);}
return true;}catch(error){console.error('☁️ Failed to save character to cloud:',error);return false;}}
function handleSessionExpired(){updateAuthUI();if(window.App&&window.App.showConfirmationOverlay){window.App.showConfirmationOverlay('Your session has expired. Your character is safe locally. Log in to sync with the cloud, or continue as guest.',()=>{showAuthModal();},()=>{},{primaryLabel:'LOG IN',secondaryLabel:'CONTINUE AS GUEST'});}else if(window.App&&window.App.showNotification){window.App.showNotification('⚠ Session expired - log in again to sync','warning');}}
function initBuilderAuth(){updateAuthUI();if(window.AuthService&&window.AuthService.isAuthenticated()){if(typeof window.AuthService.startSessionMonitor==='function'){window.AuthService.startSessionMonitor();}}
window.addEventListener('danddy:sessionExpired',handleSessionExpired);}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initBuilderAuth);}else{initBuilderAuth();}
console.log('☁️ Character Builder Cloud Integration loaded');