import type { DocumentServiceId } from '@/lib/routes';
import type { ServicePresentation } from './presentation-types';
import ServiceHero from './ServiceHero';
import ServiceAdvantages from './ServiceAdvantages';
import ServiceOverview from './ServiceOverview';
import ServiceRegulations from './ServiceRegulations';
import ServiceProcess from './ServiceProcess';
import ServiceContents from './ServiceContents';
import ServicePrice from './ServicePrice';
import ServiceNext from './ServiceNext';
import ServiceSourceData from './ServiceSourceData';
import ServiceStructure from './ServiceStructure';
import QuestionnaireHero from '../questionnaire/QuestionnaireHero';
import QuestionnaireAdvantages from '../questionnaire/QuestionnaireAdvantages';
import QuestionnaireOverview from '../questionnaire/QuestionnaireOverview';
import QuestionnaireRegulations from '../questionnaire/QuestionnaireRegulations';
import QuestionnaireProcess from '../questionnaire/QuestionnaireProcess';
import QuestionnaireContents from '../questionnaire/QuestionnaireContents';
import QuestionnairePrice from '../questionnaire/QuestionnairePrice';
import QuestionnaireNext from '../questionnaire/QuestionnaireNext';
import QuestionnaireSourceData from '../questionnaire/QuestionnaireSourceData';
import QuestionnaireStructure from '../questionnaire/QuestionnaireStructure';

export const servicePresentations: Record<
  Exclude<DocumentServiceId, 'update'>,
  ServicePresentation
> = {
  survey: {
    Hero: ServiceHero,
    Advantages: ServiceAdvantages,
    Overview: ServiceOverview,
    Regulations: ServiceRegulations,
    Process: ServiceProcess,
    Contents: ServiceContents,
    Price: ServicePrice,
    Next: ServiceNext,
    SourceData: ServiceSourceData,
    Structure: ServiceStructure,
  },
  questionnaire: {
    Hero: QuestionnaireHero,
    Advantages: QuestionnaireAdvantages,
    Overview: QuestionnaireOverview,
    Regulations: QuestionnaireRegulations,
    Process: QuestionnaireProcess,
    Contents: QuestionnaireContents,
    Price: QuestionnairePrice,
    Next: QuestionnaireNext,
    SourceData: QuestionnaireSourceData,
    Structure: QuestionnaireStructure,
  },
};
