# Detail podle čitelnosti listu a plného MID

R4 držel blízkou geometrii do22/30/40m. V B5 pohledu ze17,4m to znamenalo přibližně610tisíc trojúhelníků jen pro jeden listnáč, přestože8cm část při720px/FOV0,85 zabírá asi3,65px. Obyčejný přechod na původní MID nebyl vhodný: skutečný obraz potvrdil řidší korunu a zdroj obsahoval jen polovinu listů.

Porovnány byly zachování celé původní geometrie, prostý sparse MID, jedna/kolmé baked plochy a plný MID z původních komponent. Jedna ani2/3kolmé projekce nejsou přijaty jako univerzální náhrada: šikmé velké studio ukázalo výrazné ztráty a přebytky. Jejich použitelnost ve skutečné vzdálenosti není tímto vyřešena. Zvolený další herní pilot má všechny původní listy ve MID, ale jednoduchý quad místo blízké zakřivené geometrie; Fir má stejné úplné větévky se6tri obalem. Kořeny, rozměry, UV a ranky zůstávají.

Pouze takto offline ověřené prototypy mají `lodProfile: "full-coverage"`. Název označuje **plnou MID populaci**, nikoli záruku plného LOD2. Profil při referenčních720px/FOV0,85 přepíná hero naMID v6/8/12m (low/medium/high). Historické v1/R4 modely bez příznaku zachovávají původní policy. Fokální měřítko se bere ze skutečné projekční matice, renderovací výšky a viewportu, takže vyšší rozlišení nebo užší FOV drží detail dále. Pro perspektivu platí `f = H/(2*tan(FOV/2))`; v8m má8cm část přibližně7,95px.

Nový profil měří konzervativní vodorovnou vzdálenost k úsečce hráč–kamera, shodně s trávou. Tím chrání blízký strom u kamery třetí osoby, i když hráč stojí dál. Výška není důvodem snížit detail; může tedy ponechat více geometrie, než je nezbytné. Výběr používá dosavadní cadence, nepřidává frame-by-frame geometrii nebo alokace prototypů. LOD2 prahy se škálují stejnou projekcí.

Omezení: původní wood MID byl navržen při22m; jeho0,5px diameter cutoff odpovídá asi1,38px při8m. Nová hranice je kandidát k obrazovému/GPU posouzení, ne přijatý univerzální pixelový limit. Native woodB má rovněž oddělenou radiální chybu, kterou nelze zaměnit s interpolací křivky. Reálná vzdálená viditelnost a přechody se ještě ověří.

Regrese skutečného TreeRendereru/FreeCamera potvrzuje nezměněnou legacy policy, camera/player segment, FOV a explicitní manifest opt-in. Cílený streaming běh13/13PASS; společný routing/startup/policy43/43PASS, tscPASS. Zdrojová data a raw LOD0/2 ověřil samostatně modelář. Nejde o GPU nebo60FPS důkaz.
